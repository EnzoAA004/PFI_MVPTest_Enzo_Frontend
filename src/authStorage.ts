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

export async function hydrateAuthSession(): Promise<AuthSession | null> {
  if (cachedSession) return cachedSession;
  const raw = await asyncGetItem(AUTH_KEY);
  return parseSession(raw);
}

export function saveAuthSession(tokens: AuthTokenResponse): AuthSession {
  const session: AuthSession = { ...tokens, createdAt: tokens.createdAt ?? new Date().toISOString(), storedAt: new Date().toISOString() };
  cachedSession = session;
  void asyncSetItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export function clearAuthSession() {
  cachedSession = null;
  void asyncRemoveItem(AUTH_KEY);
}
