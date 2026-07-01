import type { AuthSession, AuthTokenResponse } from "./appTypes";
import { asyncGetItem, asyncRemoveItem, asyncSetItem } from "./browserStorage";

const AUTH_KEY = "lumbar-mri-auth-session-v1";
let cachedSession: AuthSession | null = null;

export function getCachedAuthSession(): AuthSession | null {
  return cachedSession;
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  try {
    const raw = await asyncGetItem(AUTH_KEY);
    cachedSession = raw ? (JSON.parse(raw) as AuthSession) : null;
    return cachedSession;
  } catch {
    cachedSession = null;
    return null;
  }
}

export function saveAuthSession(tokens: AuthTokenResponse): AuthSession {
  const session: AuthSession = { ...tokens, createdAt: new Date().toISOString() };
  cachedSession = session;
  void asyncSetItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  cachedSession = null;
  void asyncRemoveItem(AUTH_KEY);
}
