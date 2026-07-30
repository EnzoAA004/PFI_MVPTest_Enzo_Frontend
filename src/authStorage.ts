import type { AuthSession, AuthTokenResponse } from "./appTypes";
import { asyncGetItem, asyncRemoveItem, asyncSetItem } from "./browserStorage";

const AUTH_KEY = "lumbar-mri-auth-session-v1";
let cachedSession: AuthSession | null = null;

function parseSession(raw: string | null): AuthSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as AuthSession;
    if (!value?.accessToken || !value?.refreshToken || !value?.user?.email) return null;
    cachedSession = value;
    return value;
  } catch {
    return null;
  }
}

export function getCachedAuthSession(): AuthSession | null {
  return cachedSession;
}

export function loadAuthSession(): AuthSession | null {
  return cachedSession;
}

/**
 * La sesión se guarda en IndexedDB, que es asíncrono: entre el arranque y el fin
 * de la hidratación la caché está vacía. Sin esperar aquí, cualquier request
 * protegido que salga en esa ventana viaja sin Authorization, recibe 401 y dispara
 * un refresh que tampoco encuentra refresh token, de modo que la sesión se
 * invalida y el usuario queda deslogueado en la práctica aunque su token siga
 * siendo válido.
 *
 * La promesa se memoriza para que N llamantes concurrentes hidraten una sola vez.
 */
let hydration: Promise<AuthSession | null> | null = null;

export function ensureAuthSession(): Promise<AuthSession | null> {
  if (cachedSession) return Promise.resolve(cachedSession);
  hydration ??= asyncGetItem(AUTH_KEY).then(parseSession);
  return hydration;
}

export async function hydrateAuthSession(): Promise<AuthSession | null> {
  return ensureAuthSession();
}

export function saveAuthSession(tokens: AuthTokenResponse): AuthSession {
  const session: AuthSession = { ...tokens, createdAt: tokens.createdAt ?? new Date().toISOString(), storedAt: new Date().toISOString() };
  cachedSession = session;
  void asyncSetItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  cachedSession = null;
  // Se descarta la hidratación memorizada: si no, un login posterior seguiría
  // resolviendo la sesión vieja que quedó en la promesa.
  hydration = null;
  void asyncRemoveItem(AUTH_KEY);
}
