export type ErrorKind =
  | "input"
  | "config"
  | "style"
  | "provider"
  | "network"
  | "export";

export interface SmartIllustratorErrorOptions {
  kind: ErrorKind;
  message: string;
  code?: string;
  retryable?: boolean;
  cause?: unknown;
}

const RETRYABLE_KINDS = new Set<ErrorKind>(["network", "provider"]);

export class SmartIllustratorError extends Error {
  readonly kind: ErrorKind;
  readonly code?: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(options: SmartIllustratorErrorOptions) {
    super(options.message);
    this.name = "SmartIllustratorError";
    this.kind = options.kind;
    this.code = options.code;
    this.retryable =
      options.retryable ?? RETRYABLE_KINDS.has(options.kind);
    this.cause = options.cause;
  }
}

function extractMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "Unknown error";
}

function retryableByStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function inferKindFromMessage(message: string): ErrorKind | null {
  if (
    /(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network|fetch failed|socket hang up)/i.test(
      message,
    )
  ) {
    return "network";
  }
  if (/(config|配置)/i.test(message)) {
    return "config";
  }
  if (/(style|风格)/i.test(message)) {
    return "style";
  }
  if (/(ENOENT|EACCES|EPERM|write|输出|导出)/i.test(message)) {
    return "export";
  }
  if (
    /(API|provider|model|Tuzi|HTTP \d{3}|status \d{3})/i.test(
      message,
    )
  ) {
    return "provider";
  }
  return null;
}

function inferRetryable(kind: ErrorKind, message: string): boolean {
  if (kind === "network") {
    return true;
  }
  if (kind !== "provider") {
    return false;
  }

  const statusMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (statusMatch) {
    return retryableByStatus(parseInt(statusMatch[1], 10));
  }

  return /(timeout|temporar|rate limit|Too Many Requests|No image generated)/i.test(
    message,
  );
}

export function buildHttpError(options: {
  provider: string;
  status: number;
  statusText: string;
  detail?: string;
}): SmartIllustratorError {
  const { provider, status, statusText, detail } = options;
  const message = detail
    ? `${provider} API 请求失败（HTTP ${status} ${statusText}）：${detail}`
    : `${provider} API 请求失败（HTTP ${status} ${statusText}）`;

  return new SmartIllustratorError({
    kind: "provider",
    code: `HTTP_${status}`,
    message,
    retryable: retryableByStatus(status),
  });
}

export function asSmartIllustratorError(
  error: unknown,
  fallbackKind: ErrorKind = "provider",
): SmartIllustratorError {
  if (error instanceof SmartIllustratorError) {
    return error;
  }

  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return new SmartIllustratorError({
      kind: "network",
      code: "REQUEST_TIMEOUT",
      message: "请求超时",
      retryable: true,
      cause: error,
    });
  }

  const message = extractMessage(error);
  const inferredKind = inferKindFromMessage(message) ?? fallbackKind;

  return new SmartIllustratorError({
    kind: inferredKind,
    message,
    retryable: inferRetryable(inferredKind, message),
    cause: error,
  });
}

export function isRetryableError(error: unknown): boolean {
  return asSmartIllustratorError(error).retryable;
}

export function formatCliError(error: unknown): string {
  const appError = asSmartIllustratorError(error);
  return `[${appError.kind}] ${appError.message}`;
}
