export type IdleHandle = number;

/** Runs `callback` when the browser is next idle, or after `timeoutMs` if it never is — falls back to
 * a plain `setTimeout` where `requestIdleCallback` doesn't exist (Safari, jsdom in tests). */
export function schedule_idle(
  callback: () => void,
  timeoutMs = 500,
): IdleHandle {
  if (typeof requestIdleCallback === "function") {
    return requestIdleCallback(callback, { timeout: timeoutMs });
  }
  return setTimeout(callback, 0) as unknown as IdleHandle;
}

export function cancel_idle(handle: IdleHandle): void {
  if (typeof cancelIdleCallback === "function") {
    cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}
