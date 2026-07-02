import { API_BASE_URL } from "./api";
import { clearAuthSession, getCachedAuthSession, saveAuthSession } from "./authStorage";
import type { AuthPendingResponse, AuthTokenResponse, RegisterRequest } from "./appTypes";

async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Backend respondio ${response.status}`);
  return (await response.json()) as T;
}

export function authHeaders(): Record<string, string> {
  const session = getCachedAuthSession();
  if (!session?.accessToken) return {};
  return { Authorization: `Bearer ${session.accessToken}` };
}

export function registerDoctor(payload: RegisterRequest) {
  return authRequest<AuthPendingResponse>("/api/auth/register", payload);
}

export function loginDoctor(email: string, password: string) {
  return authRequest<AuthPendingResponse>("/api/auth/login", { email, password });
}

export async function verifyRegistration(challengeId: string, code: string) {
  const tokens = await authRequest<AuthTokenResponse>("/api/auth/verify-registration", { challengeId, code });
  return saveAuthSession(tokens);
}

export async function verifyLogin(challengeId: string, code: string) {
  const tokens = await authRequest<AuthTokenResponse>("/api/auth/verify-login", { challengeId, code });
  return saveAuthSession(tokens);
}

export async function createDemoDoctorSession() {
  const tokens = await authRequest<AuthTokenResponse>("/api/auth/demo-doctor");
  return saveAuthSession(tokens);
}

export async function refreshDoctorSession() {
  const session = getCachedAuthSession();
  if (!session?.refreshToken) throw new Error("No hay refresh token disponible");
  const tokens = await authRequest<AuthTokenResponse>("/api/auth/refresh", { refreshToken: session.refreshToken });
  return saveAuthSession(tokens);
}

export async function logoutDoctor() {
  const session = getCachedAuthSession();
  if (session?.refreshToken) {
    await authRequest<{ status: string }>("/api/auth/logout", { refreshToken: session.refreshToken }).catch(() => ({ status: "local" }));
  }
  clearAuthSession();
}
