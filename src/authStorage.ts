import type { AuthSession, AuthTokenResponse } from "./appTypes";

const AUTH_KEY = "lumbar-mri-auth-session-v1";

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadAuthSession(): AuthSession | null {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(tokens: AuthTokenResponse): AuthSession {
  const session: AuthSession = { ...tokens, createdAt: new Date().toISOString() };
  if (hasStorage()) window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  if (hasStorage()) window.localStorage.removeItem(AUTH_KEY);
}
