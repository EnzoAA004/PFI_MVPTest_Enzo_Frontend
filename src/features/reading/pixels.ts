import { isAuthorizedBackendUrl } from "../../security/originPolicy";
import { ensureAuthSession } from "../../authStorage";
import { authHeaders, refreshDoctorSession } from "../../authClient";

/**
 * Píxeles crudos de un corte.
 *
 * El PNG que servía el backend venía a 8 bits y con una ventana ya aplicada, así
 * que el control de W/L del visor era un filtro de brillo y contraste sobre esa
 * imagen: subir el contraste no recuperaba información, la estiraba. Con las
 * intensidades originales el visor mapea centro y ancho de verdad, que es lo que
 * hace un PACS y lo que permite separar un disco herniado del saco tecal.
 */

export type SlicePixelsMeta = {
  count: number;
  width: number;
  height: number;
  dtype: "int16";
  byteOrder: "little";
  min: number;
  max: number;
};

export function parseSlicePixelsMeta(value: unknown): SlicePixelsMeta | undefined {
  const raw = value as Partial<SlicePixelsMeta> | undefined;
  if (!raw || raw.dtype !== "int16" || raw.byteOrder !== "little") return undefined;
  const { count, width, height, min, max } = raw;
  if ([count, width, height, min, max].some((item) => typeof item !== "number")) return undefined;
  if (count! <= 0 || width! <= 0 || height! <= 0) return undefined;
  return { count: count!, width: width!, height: height!, dtype: "int16", byteOrder: "little", min: min!, max: max! };
}

/** Ventana inicial: todo el rango de la serie, que es lo que el dato respalda. */
export function defaultWindow(meta: SlicePixelsMeta) {
  return { center: (meta.max + meta.min) / 2, width: Math.max(1, meta.max - meta.min) };
}

export type WindowSetting = { center: number; width: number };

/**
 * Ventana que deja fuera las colas del histograma del corte.
 *
 * **Por qué por percentiles y no por tejido.** Un PACS de TC ofrece "hueso 300/1500"
 * porque la unidad Hounsfield está calibrada: el mismo tejido da el mismo número en
 * cualquier equipo. La resonancia no tiene esa calibración — la intensidad depende de
 * la secuencia, de la bobina y de la ganancia del receptor, y en este dataset los
 * rangos por corte varían en un orden de magnitud. Un preset "hueso" con números fijos
 * mostraría negro en la mitad de los estudios, y en la otra mitad estaría acertando
 * por casualidad. Los percentiles se calculan sobre el corte que se está mirando, así
 * que valen siempre y no afirman qué tejido se está viendo.
 *
 * El histograma se arma con recuento entero sobre el rango real del corte; no se
 * ordena el arreglo, que en un corte de 512x512 costaría más que dibujarlo.
 */
export function percentileWindow(
  pixels: Int16Array,
  meta: SlicePixelsMeta,
  lowFraction: number,
  highFraction: number,
): WindowSetting {
  const span = meta.max - meta.min;
  if (!(span > 0) || pixels.length === 0) return defaultWindow(meta);
  const BINS = 1024;
  const bins = new Uint32Array(BINS);
  for (let index = 0; index < pixels.length; index += 1) {
    const position = Math.floor((pixels[index] - meta.min) / span * (BINS - 1));
    bins[position < 0 ? 0 : position > BINS - 1 ? BINS - 1 : position] += 1;
  }
  const valueAt = (fraction: number) => {
    const target = fraction * pixels.length;
    let seen = 0;
    for (let bin = 0; bin < BINS; bin += 1) {
      seen += bins[bin];
      if (seen >= target) return meta.min + bin / (BINS - 1) * span;
    }
    return meta.max;
  };
  const low = valueAt(lowFraction);
  const high = valueAt(highFraction);
  // Un corte casi uniforme puede dar las dos puntas en el mismo bin: sin ancho no hay
  // imagen, solo blanco y negro puros.
  if (!(high - low > 0)) return defaultWindow(meta);
  return { center: (high + low) / 2, width: high - low };
}

/**
 * URL del corte crudo, derivada de la del corte inferido.
 *
 * Vive en el mismo directorio de assets de la corrida, así que se reemplaza el
 * último segmento: no se arma una ruta nueva y el origen queda intacto.
 */
export function slicePixelsUrl(inputUrl: string | null | undefined, index: number) {
  if (!inputUrl) return undefined;
  const separator = inputUrl.lastIndexOf("/");
  if (separator < 0) return undefined;
  return `${inputUrl.slice(0, separator + 1)}slice-${String(index).padStart(3, "0")}.raw`;
}

const cache = new Map<string, Int16Array>();
const MAX_CACHED_SLICES = 24;

/**
 * Descarga un corte crudo, con caché acotada.
 *
 * El límite es más bajo que el de las imágenes porque cada corte pesa dos bytes
 * por píxel: una serie de 384×352 son 270 KB por corte, y guardarlos todos sin
 * techo haría crecer la memoria con cada estudio que el médico abre.
 */
export async function fetchSlicePixels(url: string, signal?: AbortSignal): Promise<Int16Array> {
  const cached = cache.get(url);
  if (cached) return cached;
  if (!isAuthorizedBackendUrl(url)) throw new Error("Corte crudo rechazado: origen no autorizado.");

  const request = async () => {
    const session = await ensureAuthSession();
    const headers = session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : authHeaders();
    return fetch(url, { method: "GET", headers, signal });
  };
  let response = await request();
  if (response.status === 401) {
    await refreshDoctorSession();
    response = await request();
  }
  if (!response.ok) throw new Error(`No se pudo descargar el corte: backend respondio ${response.status}.`);

  const pixels = new Int16Array(await response.arrayBuffer());
  cache.set(url, pixels);
  while (cache.size > MAX_CACHED_SLICES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return pixels;
}

export function clearSlicePixelsCache() {
  cache.clear();
}

/**
 * Aplica ventana a las intensidades y produce la imagen en escala de grises.
 *
 * Es el mapeo estándar: todo lo que cae por debajo de `center - width/2` es negro,
 * lo que supera `center + width/2` es blanco, y en el medio se interpola lineal.
 * A diferencia de un filtro de contraste, acá mover la ventana revela estructuras
 * que el PNG había colapsado a un mismo gris.
 */
export function applyWindow(
  pixels: Int16Array,
  width: number,
  height: number,
  center: number,
  windowWidth: number,
): ImageData {
  const image = new ImageData(width, height);
  const output = image.data;
  const span = Math.max(1, windowWidth);
  const low = center - span / 2;
  const scale = 255 / span;
  const total = Math.min(pixels.length, width * height);
  for (let index = 0; index < total; index += 1) {
    let value = (pixels[index] - low) * scale;
    value = value < 0 ? 0 : value > 255 ? 255 : value;
    const offset = index * 4;
    output[offset] = value;
    output[offset + 1] = value;
    output[offset + 2] = value;
    output[offset + 3] = 255;
  }
  return image;
}
