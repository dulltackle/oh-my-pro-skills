import { describe, expect, it } from "vitest";
import {
  SmartIllustratorError,
  asSmartIllustratorError,
  buildHttpError,
  formatCliError,
} from "../../lib/errors.js";

describe("errors", () => {
  it("keeps SmartIllustratorError as-is", () => {
    const original = new SmartIllustratorError({
      kind: "style",
      message: "style missing",
      retryable: false,
    });

    const wrapped = asSmartIllustratorError(original);
    expect(wrapped).toBe(original);
    expect(wrapped.kind).toBe("style");
    expect(wrapped.retryable).toBe(false);
  });

  it("classifies network-like errors as retryable network", () => {
    const wrapped = asSmartIllustratorError(new Error("fetch failed: ECONNRESET"));
    expect(wrapped.kind).toBe("network");
    expect(wrapped.retryable).toBe(true);
  });

  it("keeps legacy provider errors compatible", () => {
    const wrapped = asSmartIllustratorError(
      new Error("OpenRouter API failed with status 500"),
    );
    expect(wrapped.kind).toBe("provider");
    expect(wrapped.retryable).toBe(true);
  });

  it("marks 5xx HTTP provider errors as retryable", () => {
    const wrapped = buildHttpError({
      provider: "gemini",
      status: 503,
      statusText: "Service Unavailable",
      detail: "upstream timeout",
    });
    expect(wrapped.kind).toBe("provider");
    expect(wrapped.retryable).toBe(true);
    expect(wrapped.message).toContain("HTTP 503");
  });

  it("marks 4xx provider errors as non-retryable except throttling", () => {
    const badRequest = buildHttpError({
      provider: "openrouter",
      status: 400,
      statusText: "Bad Request",
    });
    const throttled = buildHttpError({
      provider: "openrouter",
      status: 429,
      statusText: "Too Many Requests",
    });

    expect(badRequest.retryable).toBe(false);
    expect(throttled.retryable).toBe(true);
  });

  it("formats CLI message with kind prefix", () => {
    const message = formatCliError(
      new SmartIllustratorError({
        kind: "input",
        message: "missing prompt",
        retryable: false,
      }),
    );
    expect(message).toBe("[input] missing prompt");
  });
});
