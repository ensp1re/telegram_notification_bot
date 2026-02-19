import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";
import * as path from "path";

export interface TwitterAccount {
  username: string;
  password: string;
  email: string;
  emailPassword?: string;
  twoFactorSecret?: string;
  ct0?: string;
  authToken?: string;
}

export interface CookieEntry {
  username: string;
  password: string;
  email: string;
  twofa: string;
  cookies: string[];
}

function normalizeTwoFactorSecret(value?: string): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  const last = v.includes("/") ? v.split("/").pop() : v;
  return last?.trim() || undefined;
}

export function parseAccountsFromTxt(raw: string): TwitterAccount[] {
  const lines = raw
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && !x.startsWith("#"));

  const accounts: TwitterAccount[] = [];

  for (const line of lines) {
    const parts = line.split(":");
    if (parts.length < 7) continue;

    const username = parts[0];
    const password = parts[1];
    const email = parts[2];
    const emailPassword = parts[3];
    const authToken = parts[parts.length - 1];
    const ct0 = parts[parts.length - 2];
    const twoFaRaw = parts.slice(4, parts.length - 2).join(":");
    const twoFactorSecret = normalizeTwoFactorSecret(twoFaRaw);

    if (!username || !password || !email) continue;

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

@Injectable()
export class AccountsStore implements OnModuleInit {
  private readonly logger = new Logger(AccountsStore.name);
  private accounts: TwitterAccount[] = [];
  private readonly accountsPath: string;
  private readonly cookiesPath: string;

  constructor(private config: ConfigService) {
    this.accountsPath = config.get<string>(
      "ACCOUNTS_TXT_PATH",
      path.resolve(process.cwd(), "twitters.txt"),
    );
    this.cookiesPath = config.get<string>(
      "COOKIES_JSON_PATH",
      path.resolve(process.cwd(), "cookies.json"),
    );
  }

  onModuleInit() {
    this.reload();
  }

  reload(): void {
    if (!fs.existsSync(this.accountsPath)) {
      this.logger.warn(`Accounts file not found: ${this.accountsPath}`);
      this.accounts = [];
      return;
    }
    const raw = fs.readFileSync(this.accountsPath, "utf-8");
    this.accounts = parseAccountsFromTxt(raw);
    this.logger.log(`Loaded ${this.accounts.length} accounts`);
  }

  listAccounts(): TwitterAccount[] {
    return [...this.accounts];
  }

  loadCookies(username: string): string[] | null {
    const entries = this.readCookiesFile();
    const entry = entries.find((e) => e.username === username);
    return entry?.cookies?.length ? entry.cookies : null;
  }

  saveCookies(account: TwitterAccount, cookies: string[]): void {
    const entries = this.readCookiesFile();
    const idx = entries.findIndex((e) => e.username === account.username);
    const entry: CookieEntry = {
      username: account.username,
      password: account.password,
      email: account.email,
      twofa: account.twoFactorSecret ?? "",
      cookies,
    };

    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }

    fs.writeFileSync(this.cookiesPath, JSON.stringify(entries, null, 2));
    this.logger.debug(`Saved cookies for @${account.username}`);
  }

  private readCookiesFile(): CookieEntry[] {
    if (!fs.existsSync(this.cookiesPath)) return [];
    try {
      return JSON.parse(
        fs.readFileSync(this.cookiesPath, "utf-8"),
      ) as CookieEntry[];
    } catch {
      return [];
    }
  }
}
