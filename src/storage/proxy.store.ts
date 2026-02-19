import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs";
import * as path from "path";

export interface ProxyEntry {
  url: string;
  host: string;
  port: string;
}

export function parseProxiesFromTxt(raw: string): ProxyEntry[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const proxies: ProxyEntry[] = [];

  for (const line of lines) {
    const parts = line.split(":");
    if (parts.length === 4) {
      const [ip, port, user, pass] = parts;
      proxies.push({
        url: `http://${user}:${pass}@${ip}:${port}/`,
        host: ip,
        port,
      });
    } else if (parts.length === 2) {
      proxies.push({
        url: `http://${parts[0]}:${parts[1]}/`,
        host: parts[0],
        port: parts[1],
      });
    }
  }

  return proxies;
}

@Injectable()
export class ProxyStore implements OnModuleInit {
  private readonly logger = new Logger(ProxyStore.name);
  private proxies: ProxyEntry[] = [];
  private readonly proxiesPath: string;

  constructor(private config: ConfigService) {
    this.proxiesPath = config.get<string>(
      "PROXIES_TXT_PATH",
      path.resolve(process.cwd(), "proxies.txt"),
    );
  }

  onModuleInit() {
    this.reload();
  }

  reload(): void {
    if (!fs.existsSync(this.proxiesPath)) {
      this.logger.warn(`Proxies file not found: ${this.proxiesPath}`);
      this.proxies = [];
      return;
    }
    const raw = fs.readFileSync(this.proxiesPath, "utf-8");
    this.proxies = parseProxiesFromTxt(raw);
    this.logger.log(`Loaded ${this.proxies.length} proxies`);
  }

  listProxies(): ProxyEntry[] {
    return [...this.proxies];
  }

  pickRandom(): ProxyEntry | undefined {
    if (this.proxies.length === 0) return undefined;
    return this.proxies[Math.floor(Math.random() * this.proxies.length)];
  }

  get count(): number {
    return this.proxies.length;
  }
}
