export enum ErrorType {
  TIMEOUT = "timeout",
  NETWORK = "network",
  RATE_LIMIT = "rate_limit",
  AUTH = "authentication",
  NOT_FOUND = "not_found",
  ACCOUNT_LOCKED = "account_locked",
  UNKNOWN = "unknown",
}

export function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase();

  if (message.includes("timeout") || message.includes("timed out")) {
    return ErrorType.TIMEOUT;
  }
  if (
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("connection") ||
    message.includes("socket") ||
    message.includes("econnreset") ||
    message.includes("enotfound")
  ) {
    return ErrorType.NETWORK;
  }
  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return ErrorType.RATE_LIMIT;
  }
  if (
    message.includes("unauthorized") ||
    message.includes("401") ||
    message.includes("authentication failed") ||
    (message.includes("status") && message.includes("403"))
  ) {
    return ErrorType.AUTH;
  }
  if (message.includes("not found") || message.includes("404")) {
    return ErrorType.NOT_FOUND;
  }
  if (
    message.includes("locked") ||
    message.includes("suspended") ||
    message.includes("verify your identity")
  ) {
    return ErrorType.ACCOUNT_LOCKED;
  }
  return ErrorType.UNKNOWN;
}

export function isTransientError(errorType: ErrorType): boolean {
  return (
    errorType === ErrorType.TIMEOUT ||
    errorType === ErrorType.NETWORK ||
    errorType === ErrorType.UNKNOWN
  );
}

export function errorTypeToHttpStatus(errorType: ErrorType): number {
  switch (errorType) {
    case ErrorType.RATE_LIMIT:
      return 429;
    case ErrorType.AUTH:
      return 401;
    case ErrorType.NOT_FOUND:
      return 404;
    case ErrorType.ACCOUNT_LOCKED:
      return 503;
    case ErrorType.TIMEOUT:
    case ErrorType.NETWORK:
      return 502;
    default:
      return 500;
  }
}
