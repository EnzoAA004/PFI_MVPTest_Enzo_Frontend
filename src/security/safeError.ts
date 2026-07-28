/** Safe error presentation model (P10-C.1 §6). */

export type SafeFrontendError = {
  message: string;
  status?: number;
  code?: string;
  traceId?: string;
  suggestedAction?: "login" | "contact_admin" | "retry_later" | "check_input" | undefined;
};

const STATUS_MESSAGES: Record<number, string> = {
  400: "La solicitud no es válida.",
  401: "La sesión venció o no es válida. Iniciá sesión nuevamente.",
  403: "No tenés permiso para realizar esta acción.",
  404: "El recurso solicitado no está disponible.",
  409: "Hay un conflicto con el estado actual del recurso.",
  413: "El archivo es demasiado grande.",
  415: "El formato del archivo no está permitido.",
  422: "Los datos enviados no cumplen el contrato esperado.",
  429: "Se realizaron demasiadas solicitudes. Esperá un momento e intentá de nuevo.",
};

function fallbackForStatus(status?: number): string {
  if (status === undefined) return "No se pudo completar la operación.";
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500) return "El servicio no está disponible temporalmente. Intentá más tarde.";
  return "No se pudo completar la operación.";
}

function suggestedActionForStatus(status?: number): SafeFrontendError["suggestedAction"] {
  if (status === 401) return "login";
  if (status === 403) return "contact_admin";
  if (status === 413 || status === 415 || status === 422) return "check_input";
  if (status === 429) return "retry_later";
  if (status !== undefined && status >= 500) return "retry_later";
  return undefined;
}

// Patterns that indicate an upstream/raw exception, stack trace, SQL, path,
// token, or markup leaked into a message instead of a curated one. Never
// render a message matching these; fall back to the status-based mapping.
const UNSAFE_MESSAGE_PATTERNS: RegExp[] = [
  /Exception/i,
  /Traceback/i,
  /\bat\s+[\w.$]+\(/,
  /\bSELECT\b[\s\S]*\bFROM\b/i,
  /jdbc:/i,
  /postgres(?:ql)?:\/\//i,
  /DATABASE_URL/i,
  /[A-Za-z]:\\/,
  /\/tmp\//,
  /\/app\//,
  /\/content\//,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT-shaped token
  /<html/i,
  /<!DOCTYPE/i,
  /^\s*\{[\s\S]*"[a-zA-Z]+"\s*:/, // raw JSON body leaking through as text
];

export function isUnsafeErrorText(text: string): boolean {
  return UNSAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(text));
}

/** Picks a curated backend message when it's safe, otherwise the fixed status mapping. */
export function toSafeFrontendError(status: number | undefined, options: { code?: string; traceId?: string; candidateMessage?: string } = {}): SafeFrontendError {
  const { code, traceId, candidateMessage } = options;
  const safeCandidate = candidateMessage && !isUnsafeErrorText(candidateMessage) ? candidateMessage : undefined;
  return {
    message: safeCandidate ?? fallbackForStatus(status),
    status,
    code,
    traceId,
    suggestedAction: suggestedActionForStatus(status),
  };
}
