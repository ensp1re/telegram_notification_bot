import { parseProxiesFromTxt } from "./proxy.store";

describe("parseProxiesFromTxt", () => {
  it("parses ip:port:user:pass format", () => {
    const proxies = parseProxiesFromTxt(
      "1.2.3.4:8080:myuser:mypass",
    );
    expect(proxies).toHaveLength(1);
    expect(proxies[0].url).toBe("http://myuser:mypass@1.2.3.4:8080/");
    expect(proxies[0].host).toBe("1.2.3.4");
    expect(proxies[0].port).toBe("8080");
  });

  it("parses ip:port format (no auth)", () => {
    const proxies = parseProxiesFromTxt("5.6.7.8:3128");
    expect(proxies).toHaveLength(1);
    expect(proxies[0].url).toBe("http://5.6.7.8:3128/");
  });

  it("ignores comments and empty lines", () => {
    const raw = `# comment
1.2.3.4:8080:u:p

5.6.7.8:3128`;
    expect(parseProxiesFromTxt(raw)).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(parseProxiesFromTxt("")).toHaveLength(0);
  });
});
