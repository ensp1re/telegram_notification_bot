import { withTimeout } from "./timeout";

describe("withTimeout", () => {
  it("resolves when the promise finishes before the timeout", async () => {
    const result = await withTimeout(
      Promise.resolve(42),
      1000,
      "test",
    );
    expect(result).toBe(42);
  });

  it("rejects when the promise takes longer than the timeout", async () => {
    const controller = new AbortController();
    const slow = new Promise((resolve) => {
      const t = setTimeout(resolve, 5000);
      controller.signal.addEventListener("abort", () => clearTimeout(t));
    });
    await expect(withTimeout(slow, 50, "slow-op")).rejects.toThrow(
      "slow-op timed out after 50ms",
    );
    controller.abort();
  });

  it("passes through rejections from the underlying promise", async () => {
    const failing = Promise.reject(new Error("boom"));
    await expect(withTimeout(failing, 1000, "fail-op")).rejects.toThrow(
      "boom",
    );
  });
});
