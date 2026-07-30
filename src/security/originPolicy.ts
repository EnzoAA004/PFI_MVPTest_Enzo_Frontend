import { API_BASE_URL } from "../api";

/**
 * Common origin policy for every authenticated backend call (P10-C.1 §2).
 * Mirrors the stricter validation already proven for the durable 3D mesh
 * asset in adapters/multiplanarRunAdapter.ts (isDurableMeshAssetUrl): only a
 * backend-relative `/api/...` path, or an absolute URL whose origin matches
 * API_BASE_URL exactly, is authorized to receive Authorization/credentials.
 * multiplanarRunAdapter.ts keeps its own copy (its sandboxed test transpiles
 * that file in isolation with imports stripped), so this module is the
 * canonical policy for every other HTTP module in the app.
 */

const BLOCKED_URL_PATTERNS: RegExp[] = [
  /^[a-zA-Z]:\\/, // Windows drive path
  /^\/tmp\//,
  /^\/app\//,
  /\.internal(\/|$)/i,
  /trycloudflare\.com/i,
];

/**
 * Hosts que solo se aceptan cuando son exactamente el backend configurado.
 *
 * Bloquearlos por patrón impedía que el token viajara a un servicio local ajeno,
 * pero también rechazaba el propio backend en desarrollo, donde API_BASE_URL es
 * http://localhost:8080: los assets de la corrida nunca se pedían y el visor
 * quedaba en "imagen no disponible" con el estudio correctamente persistido.
 *
 * La comparación por origen exacto contra API_BASE_URL, que ya se hace más abajo,
 * es una garantía más fuerte que la coincidencia por substring: "localhost" dentro
 * de la URL no implica que el origen sea el backend (por ejemplo
 * https://localhost.evil.com), y esa distinción la resuelve `parsed.origin`.
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

const UNSAFE_SCHEMES = /^(file|data|blob|javascript|ftp):/i;

function backendOrigin(): string | undefined {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return undefined;
  }
}

/**
 * Returns the sanitized URL/path if it is authorized to receive the
 * doctor's Authorization header, otherwise undefined. Rejects before any
 * `fetch()` is attempted — callers must never fetch first and validate
 * after.
 */
export function isAuthorizedBackendUrl(value: unknown): string | undefined {
  const url = typeof value === "string" ? value.trim() : undefined;
  if (!url) return undefined;
  if (UNSAFE_SCHEMES.test(url)) return undefined;
  if (url.startsWith("//")) return undefined; // protocol-relative
  if (url.includes("..")) return undefined; // path traversal
  if (BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(url))) return undefined;
  if (url.startsWith("/api/")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return undefined; // embedded credentials
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    const origin = backendOrigin();
    const backendIsHttps = origin?.startsWith("https:");
    if (backendIsHttps && parsed.protocol !== "https:") return undefined;
    // Un host local solo se acepta si ES el backend configurado, nunca por el mero
    // hecho de llamarse localhost.
    if (LOCAL_HOSTNAMES.has(parsed.hostname) && parsed.origin !== origin) return undefined;
    if (origin && parsed.origin === origin && parsed.pathname.startsWith("/api/")) return url;
  } catch {
    return undefined;
  }
  return undefined;
}

/** Builds an absolute backend URL from a relative `/api/...` path, validating it first. */
export function buildBackendUrl(path: string): string {
  const sanitized = isAuthorizedBackendUrl(path);
  if (!sanitized) throw new Error("Ruta de backend no autorizada.");
  return sanitized.startsWith("/api/") ? `${API_BASE_URL}${sanitized}` : sanitized;
}
