import {
  classifyError,
  ErrorType,
  isTransientError,
  errorTypeToHttpStatus,
} from "./errors";

describe("classifyError", () => {
  it("classifies timeout errors", () => {
    expect(classifyError(new Error("request timed out"))).toBe(
      ErrorType.TIMEOUT,
    );
    expect(classifyError(new Error("operation timeout after 30s"))).toBe(
      ErrorType.TIMEOUT,
    );
  });

  it("classifies network errors", () => {
    expect(classifyError(new Error("fetch failed"))).toBe(ErrorType.NETWORK);
    expect(classifyError(new Error("ECONNRESET"))).toBe(ErrorType.NETWORK);
    expect(classifyError(new Error("socket hang up"))).toBe(
      ErrorType.NETWORK,
    );
  });

  it("classifies rate limit errors", () => {
    expect(classifyError(new Error("429 Too Many Requests"))).toBe(
      ErrorType.RATE_LIMIT,
    );
    expect(classifyError(new Error("rate limit exceeded"))).toBe(
      ErrorType.RATE_LIMIT,
    );
  });

  it("classifies auth errors", () => {
    expect(classifyError(new Error("401 Unauthorized"))).toBe(ErrorType.AUTH);
    expect(classifyError(new Error("status: 403 Forbidden"))).toBe(
      ErrorType.AUTH,
    );
  });

  it("classifies not-found errors", () => {
    expect(classifyError(new Error("User not found"))).toBe(
      ErrorType.NOT_FOUND,
    );
    expect(classifyError(new Error("404"))).toBe(ErrorType.NOT_FOUND);
  });

  it("classifies locked accounts", () => {
    expect(classifyError(new Error("Account locked"))).toBe(
      ErrorType.ACCOUNT_LOCKED,
    );
    expect(classifyError(new Error("temporarily suspended"))).toBe(
      ErrorType.ACCOUNT_LOCKED,
    );
  });

  it("returns unknown for unrecognised errors", () => {
    expect(classifyError(new Error("something weird"))).toBe(
      ErrorType.UNKNOWN,
    );
  });
});

describe("isTransientError", () => {
  it("marks timeout and network as transient", () => {
    expect(isTransientError(ErrorType.TIMEOUT)).toBe(true);
    expect(isTransientError(ErrorType.NETWORK)).toBe(true);
    expect(isTransientError(ErrorType.UNKNOWN)).toBe(true);
  });

  it("marks auth and rate_limit as non-transient", () => {
    expect(isTransientError(ErrorType.AUTH)).toBe(false);
    expect(isTransientError(ErrorType.RATE_LIMIT)).toBe(false);
    expect(isTransientError(ErrorType.ACCOUNT_LOCKED)).toBe(false);
  });
});

describe("errorTypeToHttpStatus", () => {
  it("maps error types to HTTP status codes", () => {
    expect(errorTypeToHttpStatus(ErrorType.RATE_LIMIT)).toBe(429);
    expect(errorTypeToHttpStatus(ErrorType.AUTH)).toBe(401);
    expect(errorTypeToHttpStatus(ErrorType.NOT_FOUND)).toBe(404);
    expect(errorTypeToHttpStatus(ErrorType.TIMEOUT)).toBe(502);
    expect(errorTypeToHttpStatus(ErrorType.UNKNOWN)).toBe(500);
  });
});
