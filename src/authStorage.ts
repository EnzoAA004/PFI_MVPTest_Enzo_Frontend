import type { AuthSession, AuthTokenResponse } from "./appTypes";
import { asyncRemoveItem, asyncSetItem } from "./browserStorage";

const AUTH_KEY = "lumbar-mri-auth-session-v1";
let cachedSession: AuthSession | null = null;

export function getCachedAuthSession(): AuthSession | null {
  return cachedSession;
}

export function loadAuthSession(): AuthSession | null {
  return cachedSession;
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
