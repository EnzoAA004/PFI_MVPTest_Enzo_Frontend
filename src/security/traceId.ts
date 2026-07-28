/** Centralized traceId generation/validation (P10-C.1 §7). */

const MAX_TRACE_ID_LENGTH = 80;
const TRACE_ID_PATTERN = /^[a-zA-Z0-9._-]{1,80}$/;

let counter = 0;

export function generateTraceId(scope = "frontend"): string {
  counter = (counter + 1) % 1_000_000;
  const random = Math.random().toString(16).slice(2, 10);
  return `${scope}-${Date.now()}-${counter}-${random}`.slice(0, MAX_TRACE_ID_LENGTH);
}

/** Validates a traceId echoed back by the backend before it's trusted/displayed/reused. */
export function sanitizeIncomingTraceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TRACE_ID_LENGTH) return undefined;
  return TRACE_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}
