import { useEffect, useState } from "react";
import { authHeaders, refreshDoctorSession } from "./authClient";
import { ensureAuthSession } from "./authStorage";
import { isAuthorizedBackendUrl } from "./security/originPolicy";

export type AuthenticatedImageState = "idle" | "loading" | "loaded" | "failed";

export type AuthenticatedImageResult = {
  state: AuthenticatedImageState;
  url?: string;
  error?: Error;
};

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function assetNameFrom(url: string) {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "asset");
  } catch {
    return "asset";
  }
}

export class AiAssetFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly assetName: string,
  ) {
    super(message);
    this.name = "AiAssetFetchError";
  }
}

async function requestAsset(url: string, signal?: AbortSignal) {
  /*
   * El header se arma con la sesión que devuelve la hidratación, no con la caché
   * síncrona: la sesión vive en IndexedDB y, hasta que termina de cargarse,
   * authHeaders() devuelve un objeto vacío. Un asset pedido en esa ventana llega
   * sin Authorization, el backend responde 401 y el reintento dispara un refresh
   * que tampoco encuentra token, de modo que la imagen nunca se muestra aunque
   * esté persistida y la sesión sea válida.
   */
  const session = await ensureAuthSession();
  const headers = session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : authHeaders();
  return fetch(url, { method: "GET", headers, signal });
}

function validateImageResponse(response: Response, url: string) {
  const contentType = response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!allowedImageTypes.has(contentType)) {
    throw new AiAssetFetchError(`Asset ${assetNameFrom(url)} rechazado: Content-Type ${contentType || "no informado"} no es una imagen permitida.`, response.status, url, assetNameFrom(url));
  }
}

export async function fetchAuthenticatedAiAsset(url: string, signal?: AbortSignal): Promise<Blob> {
  const assetName = assetNameFrom(url);
  if (!isAuthorizedBackendUrl(url)) {
    throw new AiAssetFetchError(`Asset ${assetName} rechazado: origen no autorizado.`, 0, url, assetName);
  }
  let response = await requestAsset(url, signal);
  if (response.status === 401) {
    await refreshDoctorSession();
    response = await requestAsset(url, signal);
  }
  if (!response.ok) {
    throw new AiAssetFetchError(`No se pudo descargar ${assetName}: backend respondio ${response.status}.`, response.status, url, assetName);
  }
  validateImageResponse(response, url);
  return response.blob();
}

export async function createAuthenticatedImageObjectUrl(url: string, signal?: AbortSignal) {
  const blob = await fetchAuthenticatedAiAsset(url, signal);
  return URL.createObjectURL(blob);
}

export function startAuthenticatedImageLoad(url: string, onResult: (result: AuthenticatedImageResult) => void) {
  const controller = new AbortController();
  let objectUrl: string | undefined;
  onResult({ state: "loading" });
  createAuthenticatedImageObjectUrl(url, controller.signal)
    .then((nextObjectUrl) => {
      if (controller.signal.aborted) {
        URL.revokeObjectURL(nextObjectUrl);
        return;
      }
      objectUrl = nextObjectUrl;
      onResult({ state: "loaded", url: nextObjectUrl });
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return;
      onResult({ state: "failed", error: error instanceof Error ? error : new Error("No se pudo descargar el asset protegido.") });
    });
  return () => {
    controller.abort();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
}

export function useAuthenticatedImageUrl(url?: string): AuthenticatedImageResult {
  const [result, setResult] = useState<AuthenticatedImageResult>({ state: url ? "loading" : "idle" });

  useEffect(() => {
    if (!url) {
      setResult({ state: "idle" });
      return;
    }
    return startAuthenticatedImageLoad(url, setResult);
  }, [url]);

  return result;
}
