import { describe, expect, it } from "vitest";
import { runWithRetry } from "../../lib/batch-runner.js";
import { SmartIllustratorError } from "../../lib/errors.js";

describe("batch-runner", () => {
  it("returns immediately when first attempt succeeds", async () => {
    const result = await runWithRetry(async () => "ok", {
      maxRetries: 2,
      timeoutMs: 1000,
      backoffBaseMs: 1,
    });

    expect(result.value).toBe("ok");
    expect(result.retryCount).toBe(0);
  });

  it("retries transient provider errors and then succeeds", async () => {
    let attempts = 0;
    const result = await runWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new SmartIllustratorError({
            kind: "provider",
            message: "HTTP 503",
            retryable: true,
          });
        }
        return "done";
      },
      {
        maxRetries: 2,
        timeoutMs: 1000,
        backoffBaseMs: 1,
      },
    );

    expect(result.value).toBe("done");
    expect(result.retryCount).toBe(2);
    expect(attempts).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let attempts = 0;
    await expect(
      runWithRetry(
        async () => {
          attempts += 1;
          throw new SmartIllustratorError({
            kind: "input",
            message: "bad argument",
            retryable: false,
          });
        },
        {
          maxRetries: 2,
          timeoutMs: 1000,
          backoffBaseMs: 1,
        },
      ),
    ).rejects.toBeInstanceOf(SmartIllustratorError);

    expect(attempts).toBe(1);
  });

  it("aborts on timeout and surfaces a retryable network error", async () => {
    let attempts = 0;
    await expect(
      runWithRetry(
        async (signal) => {
          attempts += 1;
          await new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => {
              reject(new DOMException("timed out", "AbortError"));
            });
          });
        },
        {
          maxRetries: 1,
          timeoutMs: 5,
          backoffBaseMs: 1,
        },
      ),
    ).rejects.toMatchObject({
      kind: "network",
      retryable: true,
    });

    expect(attempts).toBe(2);
  });
});
