import { parseAccountsFromTxt } from "./accounts.store";

describe("parseAccountsFromTxt", () => {
  it("parses the 7-field format correctly", () => {
    const line =
      "myuser:mypass:me@test.com:emailpass:twofasecret:ct0value:authtoken";
    const accounts = parseAccountsFromTxt(line);

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toEqual({
      username: "myuser",
      password: "mypass",
      email: "me@test.com",
      emailPassword: "emailpass",
      twoFactorSecret: "twofasecret",
      ct0: "ct0value",
      authToken: "authtoken",
    });
  });

  it("handles 2FA fields that contain colons (e.g. otpauth:// URIs)", () => {
    const line =
      "user:pass:a@b.com:ep:otpauth://totp/Twitter:secret=ABC:longct0:token";
    const accounts = parseAccountsFromTxt(line);

    expect(accounts).toHaveLength(1);
    // normalizeTwoFactorSecret takes the last segment after "/"
    expect(accounts[0].twoFactorSecret).toBe("Twitter:secret=ABC");
    expect(accounts[0].ct0).toBe("longct0");
    expect(accounts[0].authToken).toBe("token");
  });

  it("skips lines with fewer than 7 fields", () => {
    const raw = "bad:line:only:four:fields:six\ngood:p:e@x.com:ep:2fa:ct0:tok";
    const accounts = parseAccountsFromTxt(raw);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].username).toBe("good");
  });

  it("skips comment lines and empty lines", () => {
    const raw = `# This is a comment
    
user:pass:e@x.com:ep:2fa:ct0:tok`;
    expect(parseAccountsFromTxt(raw)).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(parseAccountsFromTxt("")).toHaveLength(0);
  });
});
