// Server-only in-memory rate limiting helpers.
// Note: process-local only. For multi-instance deployments, replace with Redis.

type FailureEntry = {
  count: number;
  lockUntil: number;
};

type WindowEntry = {
  count: number;
  windowStartedAt: number;
};

const failureMap = new Map<string, FailureEntry>();
const windowMap = new Map<string, WindowEntry>();

function nowMs(): number {
  return Date.now();
}

// Progressive lockout after repeated failures.
function lockoutMsForFailureCount(count: number): number {
  if (count >= 15) return 5 * 60_000;
  if (count >= 10) return 60_000;
  if (count >= 6) return 10_000;
  if (count >= 3) return 2_000;
  return 0;
}

export function getRetryAfterMs(key: string): number {
  const entry = failureMap.get(key);
  if (!entry || entry.lockUntil <= nowMs()) return 0;
  return Math.max(0, entry.lockUntil - nowMs());
}

export function registerFailedAuthAttempt(key: string): number {
  const entry = failureMap.get(key) ?? { count: 0, lockUntil: 0 };
  entry.count += 1;
  const lockout = lockoutMsForFailureCount(entry.count);
  entry.lockUntil = lockout > 0 ? nowMs() + lockout : 0;
  failureMap.set(key, entry);
  return lockout;
}

export function clearAuthFailures(key: string): void {
  failureMap.delete(key);
}

// Fixed-window limiter for generic endpoints.
export function consumeWindowLimit(key: string, maxRequests: number, windowMs: number): number {
  const current = nowMs();
  const entry = windowMap.get(key);
  if (!entry || current - entry.windowStartedAt >= windowMs) {
    windowMap.set(key, { count: 1, windowStartedAt: current });
    return 0;
  }

  if (entry.count >= maxRequests) {
    return Math.max(0, windowMs - (current - entry.windowStartedAt));
  }

  entry.count += 1;
  windowMap.set(key, entry);
  return 0;
}
