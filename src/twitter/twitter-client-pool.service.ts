import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Scraper } from "@the-convocation/twitter-scraper";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { AccountsStore, TwitterAccount } from "../storage/accounts.store";
import { ProxyStore, ProxyEntry } from "../storage/proxy.store";
import { ErrorType, classifyError, isTransientError } from "../common/errors";
import { withTimeout } from "../common/timeout";
import { PriorityQueue, RequestPriority } from "../common/queue";

// ---------------------------------------------------------------------------
// Account health tracking
// ---------------------------------------------------------------------------

export enum AccountStatus {
  HEALTHY = "healthy",
  PROBATION = "probation",
  COOLDOWN = "cooldown",
  DISABLED = "disabled",
  LOCKED = "locked",
}

export interface AccountHealth {
  status: AccountStatus;
  lastUsed: number;
  requestCount: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  cooldownUntil?: number;
  lastErrorType?: ErrorType;
  lastErrorTime?: number;
  successRate: number;
  requestTimestamps: number[];
}

export interface PoolStats {
  accounts: {
    total: number;
    healthy: number;
    probation: number;
    cooldown: number;
    disabled: number;
    locked: number;
  };
  proxies: { total: number };
  queue: { depth: number; maxSize: number };
  concurrency: { active: number; max: number };
  perAccount: Record<
    string,
    { status: string; requests: number; successRate: number }
  >;
}

// ---------------------------------------------------------------------------
// Pool service
// ---------------------------------------------------------------------------

@Injectable()
export class TwitterClientPoolService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TwitterClientPoolService.name);

  private healthMap = new Map<string, AccountHealth>();
  private queue: PriorityQueue;
  private activeOps = 0;

  private readonly maxConcurrency: number;
  private readonly maxConsecutiveFailures: number;
  private readonly cooldownMs: number;
  private readonly rateLimitWindow: number;
  private readonly maxRequestsPerWindow: number;

  readonly timeouts: Record<string, number>;

  private processingInterval?: ReturnType<typeof setInterval>;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(
    private config: ConfigService,
    private accounts: AccountsStore,
    private proxies: ProxyStore,
  ) {
    this.maxConcurrency = config.get<number>("MAX_CONCURRENCY", 10);
    this.maxConsecutiveFailures = 10;
    this.cooldownMs = 2 * 60_000;
    this.rateLimitWindow = 15 * 60_000;
    this.maxRequestsPerWindow = 50;
    this.queue = new PriorityQueue(
      config.get<number>("MAX_QUEUE_SIZE", 1000),
    );

    this.timeouts = {
      login: config.get<number>("TIMEOUT_LOGIN", 45_000),
      search: config.get<number>("TIMEOUT_SEARCH", 60_000),
      profile: config.get<number>("TIMEOUT_PROFILE", 30_000),
      tweet: config.get<number>("TIMEOUT_TWEET", 35_000),
      default: config.get<number>("TIMEOUT_DEFAULT", 30_000),
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  onModuleInit() {
    for (const acct of this.accounts.listAccounts()) {
      this.ensureHealth(acct.username);
    }
    this.processingInterval = setInterval(() => this.processQueue(), 100);
    this.healthCheckInterval = setInterval(
      () => this.runHealthCheck(),
      2 * 60_000,
    );
    this.logger.log(
      `Pool ready: ${this.accounts.listAccounts().length} accounts, ${this.proxies.count} proxies, max concurrency ${this.maxConcurrency}`,
    );
  }

  onModuleDestroy() {
    if (this.processingInterval) clearInterval(this.processingInterval);
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
  }

  // -----------------------------------------------------------------------
  // Public: execute an operation through the pool
  // -----------------------------------------------------------------------

  async execute<T>(
    operationType: string,
    executor: (scraper: Scraper, account: TwitterAccount) => Promise<T>,
    priority: RequestPriority = RequestPriority.MEDIUM,
  ): Promise<T> {
    return this.queue.enqueue(priority, () =>
      this.runWithRetry(operationType, executor),
    );
  }

  getStats(): PoolStats {
    const allAccounts = this.accounts.listAccounts();
    const statusCounts = {
      total: allAccounts.length,
      healthy: 0,
      probation: 0,
      cooldown: 0,
      disabled: 0,
      locked: 0,
    };
    const perAccount: PoolStats["perAccount"] = {};

    for (const acct of allAccounts) {
      const h = this.ensureHealth(acct.username);
      statusCounts[h.status] = (statusCounts[h.status] ?? 0) + 1;
      perAccount[acct.username] = {
        status: h.status,
        requests: h.requestCount,
        successRate: Math.round(h.successRate * 100),
      };
    }

    return {
      accounts: statusCounts,
      proxies: { total: this.proxies.count },
      queue: { depth: this.queue.length, maxSize: 1000 },
      concurrency: { active: this.activeOps, max: this.maxConcurrency },
      perAccount,
    };
  }

  // -----------------------------------------------------------------------
  // Internal: retry loop
  // -----------------------------------------------------------------------

  private async runWithRetry<T>(
    operationType: string,
    executor: (scraper: Scraper, account: TwitterAccount) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const account = this.selectAccount();
      if (!account) {
        throw new Error("No usable accounts available");
      }

      const proxy = this.proxies.pickRandom();
      const proxyLabel = proxy
        ? proxy.host + ":" + proxy.port
        : "direct";
      this.logger.log(
        `[${operationType}] attempt ${attempt + 1}/${maxRetries} @${account.username} via ${proxyLabel}`,
      );

      const scraper = this.createScraper(proxy);
      const health = this.ensureHealth(account.username);

      try {
        await this.authenticate(scraper, account);

        this.activeOps++;
        const startTime = Date.now();
        try {
          const result = await executor(scraper, account);
          const elapsed = Date.now() - startTime;

          this.recordSuccess(account.username);
          this.logger.log(
            `[${operationType}] @${account.username} OK in ${elapsed}ms`,
          );
          return result;
        } finally {
          this.activeOps--;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const errorType = classifyError(lastError);
        this.recordFailure(account.username, errorType);

        this.logger.warn(
          `[${operationType}] @${account.username} failed (${errorType}): ${lastError.message.slice(0, 200)}`,
        );

        if (!isTransientError(errorType)) {
          throw lastError;
        }

        const backoff =
          1000 * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    throw lastError ?? new Error(`${operationType} failed after retries`);
  }

  // -----------------------------------------------------------------------
  // Scraper creation + authentication
  // -----------------------------------------------------------------------

  private createScraper(proxy?: ProxyEntry): Scraper {
    if (!proxy) return new Scraper();

    const agent = new ProxyAgent(proxy.url);
    const proxyFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      const resp = await undiciFetch(url, {
        ...(init as Record<string, unknown>),
        dispatcher: agent,
      });

      const headers = new Headers();
      resp.headers.forEach((v, k) => headers.set(k, v));
      const body = await resp.text();
      return new Response(body, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    };

    return new Scraper({
      fetch: proxyFetch as unknown as typeof globalThis.fetch,
    });
  }

  private async authenticate(
    scraper: Scraper,
    account: TwitterAccount,
  ): Promise<void> {
    const timeoutMs = this.timeouts.login;

    // 1. Saved cookies
    const savedCookies = this.accounts.loadCookies(account.username);
    if (savedCookies?.length) {
      await scraper.setCookies(savedCookies);
      if (await this.verifySession(scraper, account.username)) {
        this.persistCookies(scraper, account);
        return;
      }
    }

    // 2. ct0 + auth_token from twitters.txt
    if (account.ct0 && account.authToken) {
      await scraper.setCookies([
        `auth_token=${account.authToken}; Domain=.x.com; Path=/; Secure; HttpOnly`,
        `ct0=${account.ct0}; Domain=.x.com; Path=/; Secure`,
      ]);
      if (await this.verifySession(scraper, account.username)) {
        this.persistCookies(scraper, account);
        return;
      }
    }

    // 3. Credential login
    await withTimeout(
      scraper.login(
        account.username,
        account.password,
        account.email,
        account.twoFactorSecret,
      ),
      timeoutMs,
      "login",
    );

    if (!(await this.verifySession(scraper, account.username))) {
      throw new Error(`Login succeeded but session not usable for @${account.username}`);
    }
    this.persistCookies(scraper, account);
  }

  private async verifySession(
    scraper: Scraper,
    username: string,
  ): Promise<boolean> {
    try {
      const userId = await withTimeout(
        scraper.getUserIdByScreenName("xdevelopers"),
        15_000,
        "session-check",
      );
      return !!userId;
    } catch {
      return false;
    }
  }

  private async persistCookies(
    scraper: Scraper,
    account: TwitterAccount,
  ): Promise<void> {
    try {
      const cookies = await scraper.getCookies();
      const serialized = cookies.map((c) =>
        typeof c === "string" ? c : c.toString(),
      );
      this.accounts.saveCookies(account, serialized);
    } catch (err) {
      this.logger.warn(
        `Failed to persist cookies for @${account.username}: ${err}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Account selection
  // -----------------------------------------------------------------------

  private selectAccount(): TwitterAccount | null {
    const now = Date.now();
    const candidates = this.accounts
      .listAccounts()
      .filter((acct) => {
        const h = this.ensureHealth(acct.username);
        if (
          h.status === AccountStatus.DISABLED ||
          h.status === AccountStatus.LOCKED
        )
          return false;
        if (h.status === AccountStatus.COOLDOWN && h.cooldownUntil && now < h.cooldownUntil)
          return false;

        // rate-limit check
        const recentRequests = h.requestTimestamps.filter(
          (t) => now - t < this.rateLimitWindow,
        );
        if (recentRequests.length >= this.maxRequestsPerWindow) return false;

        return true;
      })
      .sort((a, b) => {
        const ha = this.ensureHealth(a.username);
        const hb = this.ensureHealth(b.username);
        if (ha.status !== hb.status) {
          if (ha.status === AccountStatus.HEALTHY) return -1;
          if (hb.status === AccountStatus.HEALTHY) return 1;
        }
        if (ha.consecutiveFailures !== hb.consecutiveFailures)
          return ha.consecutiveFailures - hb.consecutiveFailures;
        return ha.lastUsed - hb.lastUsed;
      });

    return candidates[0] ?? null;
  }

  // -----------------------------------------------------------------------
  // Health tracking
  // -----------------------------------------------------------------------

  private ensureHealth(username: string): AccountHealth {
    if (!this.healthMap.has(username)) {
      this.healthMap.set(username, {
        status: AccountStatus.HEALTHY,
        lastUsed: 0,
        requestCount: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        successRate: 1,
        requestTimestamps: [],
      });
    }
    return this.healthMap.get(username)!;
  }

  private recordSuccess(username: string): void {
    const h = this.ensureHealth(username);
    const now = Date.now();
    h.lastUsed = now;
    h.requestCount++;
    h.consecutiveSuccesses++;
    h.consecutiveFailures = 0;
    h.requestTimestamps.push(now);
    h.successRate =
      h.requestCount > 0
        ? (h.requestCount -
            h.requestTimestamps.filter(
              () => false /* only failures reduce this */,
            ).length) /
          h.requestCount
        : 1;
    // simple exponential moving average
    h.successRate = h.successRate * 0.9 + 0.1;

    if (
      h.status === AccountStatus.PROBATION &&
      h.consecutiveSuccesses >= 3
    ) {
      h.status = AccountStatus.HEALTHY;
      this.logger.log(`@${username} promoted to HEALTHY`);
    }
  }

  private recordFailure(username: string, errorType: ErrorType): void {
    const h = this.ensureHealth(username);
    const now = Date.now();
    h.lastUsed = now;
    h.requestCount++;
    h.consecutiveFailures++;
    h.consecutiveSuccesses = 0;
    h.lastErrorType = errorType;
    h.lastErrorTime = now;
    h.requestTimestamps.push(now);
    h.successRate = h.successRate * 0.9;

    if (errorType === ErrorType.ACCOUNT_LOCKED) {
      h.status = AccountStatus.LOCKED;
      this.logger.error(`@${username} LOCKED`);
      return;
    }

    if (errorType === ErrorType.RATE_LIMIT) {
      h.status = AccountStatus.COOLDOWN;
      h.cooldownUntil = now + this.cooldownMs;
      this.logger.warn(`@${username} rate-limited, cooling down`);
      return;
    }

    if (h.consecutiveFailures >= this.maxConsecutiveFailures) {
      h.status = AccountStatus.COOLDOWN;
      h.cooldownUntil = now + this.cooldownMs;
      this.logger.warn(
        `@${username} too many failures (${h.consecutiveFailures}), cooling down`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Queue processing
  // -----------------------------------------------------------------------

  private processQueue(): void {
    while (
      this.activeOps < this.maxConcurrency &&
      this.queue.length > 0
    ) {
      const request = this.queue.dequeue();
      if (!request) break;

      request
        .execute()
        .then((result) => request.resolve(result))
        .catch((err) => request.reject(err));
    }
  }

  // -----------------------------------------------------------------------
  // Periodic health recovery
  // -----------------------------------------------------------------------

  private runHealthCheck(): void {
    const now = Date.now();
    for (const [username, h] of this.healthMap) {
      // prune old request timestamps
      h.requestTimestamps = h.requestTimestamps.filter(
        (t) => now - t < this.rateLimitWindow,
      );

      if (
        h.status === AccountStatus.COOLDOWN &&
        h.cooldownUntil &&
        now > h.cooldownUntil
      ) {
        h.status = AccountStatus.PROBATION;
        h.consecutiveFailures = 0;
        this.logger.log(`@${username} moved from COOLDOWN to PROBATION`);
      }
    }
  }
}
