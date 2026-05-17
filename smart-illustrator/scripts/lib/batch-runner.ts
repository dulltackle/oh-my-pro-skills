import { setTimeout as sleep } from "node:timers/promises";
import {
  asSmartIllustratorError,
  type ErrorKind,
  type SmartIllustratorError,
} from "./errors.js";

export interface RetryPolicy {
  maxRetries: number;
  timeoutMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export interface RetryEvent {
  attempt: number;
  maxAttempts: number;
  nextDelayMs: number;
  error: SmartIllustratorError;
}

export interface RetryHooks {
  onRetry?: (event: RetryEvent) => void;
}

export interface RetryResult<T> {
  value: T;
  retryCount: number;
}

const DEFAULT_POLICY: RetryPolicy = {
  maxRetries: 1,
  timeoutMs: 300_000,
  backoffBaseMs: 1_200,
  backoffMaxMs: 12_000,
};

export function clampRetryPolicy(policy: Partial<RetryPolicy> = {}): RetryPolicy {
  const maxRetries = Math.min(2, Math.max(0, policy.maxRetries ?? DEFAULT_POLICY.maxRetries));
  return {
    maxRetries,
    timeoutMs: Math.max(1_000, policy.timeoutMs ?? DEFAULT_POLICY.timeoutMs),
    backoffBaseMs: Math.max(100, policy.backoffBaseMs ?? DEFAULT_POLICY.backoffBaseMs),
    backoffMaxMs: Math.max(500, policy.backoffMaxMs ?? DEFAULT_POLICY.backoffMaxMs),
  };
}

function computeBackoffMs(policy: RetryPolicy, retryIndex: number): number {
  const raw = policy.backoffBaseMs * 2 ** Math.max(0, retryIndex - 1);
  return Math.min(policy.backoffMaxMs, raw);
}

function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return run(controller.signal).finally(() => {
    clearTimeout(timer);
  });
}

function shouldRetry(error: SmartIllustratorError): boolean {
  if (!error.retryable) {
    return false;
  }
  return error.kind === "network" || error.kind === "provider";
}

export async function runWithRetry<T>(
  run: (signal: AbortSignal, attempt: number) => Promise<T>,
  policyInput: Partial<RetryPolicy> = {},
  hooks: RetryHooks = {},
): Promise<RetryResult<T>> {
  const policy = clampRetryPolicy(policyInput);
  const maxAttempts = policy.maxRetries + 1;
  let retryCount = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await withTimeout(policy.timeoutMs, (signal) =>
        run(signal, attempt),
      );
      return { value, retryCount };
    } catch (error) {
      const fallbackKind: ErrorKind =
        error instanceof Error && /timeout|abort/i.test(error.message)
          ? "network"
          : "provider";
      const appError = asSmartIllustratorError(error, fallbackKind);
      const canRetry = attempt < maxAttempts && shouldRetry(appError);
      if (!canRetry) {
        throw appError;
      }

      retryCount += 1;
      const nextDelayMs = computeBackoffMs(policy, retryCount);
      hooks.onRetry?.({
        attempt,
        maxAttempts,
        nextDelayMs,
        error: appError,
      });
      await sleep(nextDelayMs);
    }
  }

  throw new Error("unreachable");
}
