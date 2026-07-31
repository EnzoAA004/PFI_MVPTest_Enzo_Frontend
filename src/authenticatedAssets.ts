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
  const objectUrl = URL.createObjectURL(blob);
  await decodeBeforeReporting(objectUrl);
  return objectUrl;
}

/**
 * Decodifica la imagen antes de darla por cargada.
 *
 * Descargar el blob no alcanza: al cambiar el `src`, el navegador todavía tiene
 * que decodificar el PNG, y ese intervalo dejaba el visor en negro cada vez que se
 * visitaba un corte nuevo. Decodificando acá, el estado pasa a "loaded" con el
 * cuadro ya listo para pintar y el cambio de corte es inmediato.
 *
 * Un fallo de decodificación no se propaga: la imagen igual puede renderizar por
 * la vía normal del <img>, y bloquear la carga por esto dejaría al médico sin el
 * corte por un detalle de performance.
 */
async function decodeBeforeReporting(objectUrl: string) {
  if (typeof Image === "undefined") return;
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
  } catch {
    // decode() no está disponible o la imagen no se pudo decodificar por adelantado.
  }
}

/*
 * Caché de blobs ya descargados, acotada y con desalojo del más antiguo.
 *
 * Recorrer una serie vuelve a pedir el mismo corte una y otra vez, y sin caché
 * cada vuelta atrás repetía la descarga y el visor caía al cartel de "verificando
 * recurso": scrollear rápido mostraba más placeholder que resonancia. El objeto
 * URL lo posee la caché, no quien lo consume, así que solo se revoca al desalojar
 * —revocarlo al desmontar dejaría entradas apuntando a blobs muertos.
 */
const objectUrlCache = new Map<string, string>();
const MAX_CACHED_ASSETS = 96;

function rememberObjectUrl(url: string, objectUrl: string) {
  objectUrlCache.set(url, objectUrl);
  while (objectUrlCache.size > MAX_CACHED_ASSETS) {
    const oldest = objectUrlCache.keys().next().value;
    if (oldest === undefined) break;
    const evicted = objectUrlCache.get(oldest);
    objectUrlCache.delete(oldest);
    if (evicted) URL.revokeObjectURL(evicted);
  }
}

export function clearAuthenticatedImageCache() {
  for (const objectUrl of objectUrlCache.values()) URL.revokeObjectURL(objectUrl);
  objectUrlCache.clear();
}

export function startAuthenticatedImageLoad(url: string, onResult: (result: AuthenticatedImageResult) => void) {
  const cached = objectUrlCache.get(url);
  if (cached) {
    onResult({ state: "loaded", url: cached });
    return () => {};
  }
  const controller = new AbortController();
  onResult({ state: "loading" });
  createAuthenticatedImageObjectUrl(url, controller.signal)
    .then((nextObjectUrl) => {
      if (controller.signal.aborted) {
        URL.revokeObjectURL(nextObjectUrl);
        return;
      }
      rememberObjectUrl(url, nextObjectUrl);
      onResult({ state: "loaded", url: nextObjectUrl });
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return;
      onResult({ state: "failed", error: error instanceof Error ? error : new Error("No se pudo descargar el asset protegido.") });
    });
  return () => controller.abort();
}

export function useAuthenticatedImageUrl(url?: string): AuthenticatedImageResult {
  const [result, setResult] = useState<AuthenticatedImageResult>(() => {
    const cached = url ? objectUrlCache.get(url) : undefined;
    return cached ? { state: "loaded", url: cached } : { state: url ? "loading" : "idle" };
  });

  useEffect(() => {
    if (!url) {
      setResult({ state: "idle" });
      return;
    }
    return startAuthenticatedImageLoad(url, setResult);
  }, [url]);

  return result;
}
