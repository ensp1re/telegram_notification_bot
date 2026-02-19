import { Scraper } from "@the-convocation/twitter-scraper";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const COOKIES_FILE = path.join(path.dirname(__dirname), "cookies.json");
const ACCOUNTS_TXT_FILE = path.join(path.dirname(__dirname), "twitters.txt");
const ACCOUNTS_JSON_FILE = path.join(path.dirname(__dirname), "twitters.json");
const PROXIES_TXT_FILE = path.join(path.dirname(__dirname), "proxies.txt");
const SESSION_CHECK_USER = "ensp1re";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TwitterAccount {
  username: string;
  password: string;
  email: string;
  emailPassword?: string;
  twoFactorSecret?: string;
  ct0?: string;
  authToken?: string;
  "2fa"?: string;
  cookie?: unknown[];
  isLocked?: boolean;
  usable?: boolean;
}

// ---------------------------------------------------------------------------
// Proxy agent tracking (for cleanup)
// ---------------------------------------------------------------------------

let activeProxyAgent: ProxyAgent | null = null;

export function exitProxyAgent(): void {
  if (activeProxyAgent) {
    activeProxyAgent.close();
    activeProxyAgent = null;
  }
}

// ---------------------------------------------------------------------------
// Proxy-fetch factory — returns a fetch bound to an HTTP proxy via undici
// ---------------------------------------------------------------------------

function createProxyFetch(
  proxyUrl: string
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const agent = new ProxyAgent(proxyUrl);
  activeProxyAgent = agent;

  return async function proxyFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
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
    resp.headers.forEach((value, key) => {
      headers.set(key, value);
    });

    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
  };
}

// ---------------------------------------------------------------------------
// Cookie persistence — single cookies.json file
//
// Format: [{ username, password, email, twofa, cookies }, ...]
// ---------------------------------------------------------------------------

interface CookieEntry {
  username: string;
  password: string;
  email: string;
  twofa: string;
  cookies: string[];
}

function readCookiesFile(): CookieEntry[] {
  if (!fs.existsSync(COOKIES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(COOKIES_FILE, "utf-8")) as CookieEntry[];
  } catch {
    return [];
  }
}

function writeCookiesFile(entries: CookieEntry[]): void {
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(entries, null, 2));
}

async function saveCookies(
  scraper: Scraper,
  account: TwitterAccount
): Promise<void> {
  const cookies = await scraper.getCookies();
  const serialized = cookies.map((c) =>
    typeof c === "string" ? c : c.toString()
  );

  const entries = readCookiesFile();
  const idx = entries.findIndex((e) => e.username === account.username);
  const entry: CookieEntry = {
    username: account.username,
    password: account.password,
    email: account.email,
    twofa: account.twoFactorSecret ?? "",
    cookies: serialized,
  };

  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }

  writeCookiesFile(entries);
  console.log(`  [cookies] Saved cookies for @${account.username} to cookies.json`);
}

async function loadCookies(
  scraper: Scraper,
  username: string
): Promise<boolean> {
  const entries = readCookiesFile();
  const entry = entries.find((e) => e.username === username);
  if (!entry || !entry.cookies?.length) return false;

  try {
    await scraper.setCookies(entry.cookies);
    console.log(`  [cookies] Loaded saved cookies for @${username}`);
    return true;
  } catch (err) {
    console.warn(`  [cookies] Failed to load cookies for @${username}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeTwoFactorSecret(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  const last = v.includes("/") ? v.split("/").pop() : v;
  return last?.trim() || undefined;
}

// ---------------------------------------------------------------------------
// Proxy loading
// ---------------------------------------------------------------------------

function loadProxies(): string[] {
  if (!fs.existsSync(PROXIES_TXT_FILE)) {
    console.warn("[proxy] proxies.txt not found, requests will go direct");
    return [];
  }

  const lines = fs
    .readFileSync(PROXIES_TXT_FILE, "utf-8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const proxies: string[] = [];

  for (const line of lines) {
    const parts = line.split(":");
    if (parts.length === 4) {
      const [ip, port, user, pass] = parts;
      proxies.push(`http://${user}:${pass}@${ip}:${port}/`);
    } else if (parts.length === 2) {
      proxies.push(`http://${parts[0]}:${parts[1]}/`);
    } else {
      console.warn(`[proxy] Skipping unrecognised proxy line: ${line}`);
    }
  }

  console.log(`[proxy] Loaded ${proxies.length} proxies from proxies.txt`);
  return proxies;
}

// ---------------------------------------------------------------------------
// Account parsing — new format:
//   login:password:email:email_password:2fa:ct0:auth_token
//
// ct0 and auth_token are always the last two colon-separated fields.
// Everything between field[4] and the last two fields is the 2FA secret
// (joined back with ":") so otpauth:// URIs stay intact.
// ---------------------------------------------------------------------------

function parseAccountsFromTxt(raw: string): TwitterAccount[] {
  const lines = raw
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && !x.startsWith("#"));

  const accounts: TwitterAccount[] = [];

  for (const line of lines) {
    const parts = line.split(":");
    if (parts.length < 7) {
      console.warn(
        "[auth] Skipping invalid twitters.txt line (expected >= 7 fields)"
      );
      continue;
    }

    const username = parts[0];
    const password = parts[1];
    const email = parts[2];
    const emailPassword = parts[3];
    const authToken = parts[parts.length - 1];
    const ct0 = parts[parts.length - 2];
    const twoFaRaw = parts.slice(4, parts.length - 2).join(":");
    const twoFactorSecret = normalizeTwoFactorSecret(twoFaRaw);

    if (!username || !password || !email) {
      continue;
    }

    accounts.push({
      username,
      password,
      email,
      emailPassword,
      twoFactorSecret: twoFactorSecret || undefined,
      ct0: ct0 || undefined,
      authToken: authToken || undefined,
    });
  }

  return accounts;
}

function loadAccounts(): TwitterAccount[] {
  if (fs.existsSync(ACCOUNTS_TXT_FILE)) {
    const raw = fs.readFileSync(ACCOUNTS_TXT_FILE, "utf-8");
    const fromTxt = parseAccountsFromTxt(raw);
    if (fromTxt.length > 0) {
      return fromTxt;
    }
  }

  if (fs.existsSync(ACCOUNTS_JSON_FILE)) {
    const raw = fs.readFileSync(ACCOUNTS_JSON_FILE, "utf-8");
    const data: TwitterAccount[] = JSON.parse(raw);
    return data
      .map((a) => ({
        ...a,
        twoFactorSecret: normalizeTwoFactorSecret(a["2fa"] || a.twoFactorSecret),
      }))
      .filter((a) => a.username && a.password && a.email && !a.isLocked);
  }

  throw new Error("No accounts file found. Expected twitters.txt or twitters.json");
}

// ---------------------------------------------------------------------------
// Scraper factory — binds a random proxy per scraper instance
// ---------------------------------------------------------------------------

function createScraper(proxyUrl?: string): Scraper {
  if (proxyUrl) {
    const fetchFn = createProxyFetch(proxyUrl);
    return new Scraper({
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
  }
  return new Scraper();
}

// ---------------------------------------------------------------------------
// Login with retry
// ---------------------------------------------------------------------------

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/status:\s*(429|5\d{2})/i.test(msg)) return true;
  if (/status:\s*(400|401|403)/i.test(msg)) return false;
  return true;
}

async function hasUsableApiSession(
  scraper: Scraper,
  username: string,
  context: string
): Promise<boolean> {
  try {
    const userId = await scraper.getUserIdByScreenName(SESSION_CHECK_USER);
    if (userId) {
      console.log(
        `  [session] @${username} verified via API in ${context} path`
      );
      return true;
    }
    console.log(`  [session] @${username} API check returned empty user id`);
    return false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const shortMsg = msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
    console.log(`  [session] @${username} API check failed: ${shortMsg}`);
    return false;
  }
}

async function tryLogin(
  scraper: Scraper,
  account: TwitterAccount
): Promise<boolean> {
  const { username, password, email } = account;
  const twoFactorSecret = normalizeTwoFactorSecret(
    account.twoFactorSecret || account["2fa"]
  );

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `  [login] Attempt ${attempt}/${MAX_RETRIES} for @${username}...`
      );
      await scraper.login(username, password, email, twoFactorSecret);

      if (await hasUsableApiSession(scraper, username, "login")) {
        console.log(`  [login] @${username} logged in successfully`);
        await saveCookies(scraper, account);
        return true;
      }
      console.warn(
        `  [login] @${username} login returned but session is not usable`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const shortMsg = msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
      console.warn(
        `  [login] @${username} attempt ${attempt} failed: ${shortMsg}`
      );

      if (!isTransientError(err)) {
        console.warn(`  [login] @${username} permanent error, skipping account`);
        return false;
      }
    }

    if (attempt < MAX_RETRIES) {
      const backoff = 1000 * Math.pow(2, attempt - 1);
      console.log(`  [login] Retrying in ${backoff / 1000}s...`);
      await sleep(backoff);
    }
  }

  console.error(`  [login] @${username} exhausted all retries`);
  return false;
}

async function tryAuthTokenCookies(
  scraper: Scraper,
  account: TwitterAccount
): Promise<boolean> {
  const authToken = account.authToken?.trim();
  const ct0 = account.ct0?.trim();
  if (!authToken || !ct0) return false;

  try {
    await scraper.setCookies([
      `auth_token=${authToken}; Domain=.x.com; Path=/; Secure; HttpOnly`,
      `ct0=${ct0}; Domain=.x.com; Path=/; Secure`,
    ]);

    const ok = await hasUsableApiSession(scraper, account.username, "token");
    if (ok) {
      console.log(`  [token] @${account.username} authenticated via ct0+auth_token`);
      await saveCookies(scraper, account);
      return true;
    }
    console.log(`  [token] @${account.username} ct0+auth_token invalid/expired`);
    return false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const shortMsg = msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
    console.log(`  [token] @${account.username} auth_token failed: ${shortMsg}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a Scraper that is authenticated and ready to use.
 *
 * Flow per account:
 *  1. Pick one random proxy from proxies.txt for this account attempt
 *  2. Try loading saved cookies  ->  verify with API call
 *  3. If cookies valid  ->  return immediately
 *  4. Try ct0+auth_token cookie-based auth
 *  5. If expired/missing  ->  login with credentials (3 retries, exponential backoff)
 *  6. On persistent failure  ->  skip to next account
 *  7. All accounts exhausted  ->  throw
 */
export async function getAuthenticatedScraper(): Promise<Scraper> {
  const accounts = loadAccounts();
  console.log(`[auth] Loaded ${accounts.length} accounts from accounts file`);

  const proxies = loadProxies();

  for (const account of accounts) {
    const proxyUrl = proxies.length > 0 ? pickRandom(proxies) : undefined;
    const proxyLabel = proxyUrl
      ? proxyUrl.replace(/\/\/[^:]+:[^@]+@/, "//*:*@")
      : "direct";
    console.log(`\n[auth] Trying @${account.username} via proxy ${proxyLabel}`);

    const scraper = createScraper(proxyUrl);

    // --- Fast path: try saved cookies first ---
    const hasCookies = await loadCookies(scraper, account.username);
    if (hasCookies) {
      const usable = await hasUsableApiSession(
        scraper,
        account.username,
        "cookies"
      );
      if (usable) {
        console.log(`[auth] @${account.username} session is valid (cookies)`);
        await saveCookies(scraper, account);
        return scraper;
      }
      console.log(
        `  [cookies] @${account.username} cookies expired/invalid, will re-login`
      );
    }

    // --- Token path: use ct0+auth_token from twitters.txt ---
    const viaToken = await tryAuthTokenCookies(scraper, account);
    if (viaToken) {
      return scraper;
    }

    // --- Slow path: credential login with retry ---
    const ok = await tryLogin(scraper, account);
    if (ok) {
      return scraper;
    }
  }

  throw new Error(
    "All accounts exhausted. No account could be authenticated."
  );
}
