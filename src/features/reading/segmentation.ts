/**
 * Segmentación como mapa de instancias, no como imagen.
 *
 * El AI Module manda un RLE donde cada píxel lleva el índice de la instancia a la
 * que pertenece (0 = ninguna), más la lista de instancias con su clase y su nivel.
 * El color, la visibilidad y la opacidad se deciden acá: son de presentación, y un
 * PNG ya pintado en el backend las congelaba a las tres.
 *
 * También reemplaza al contorno vectorial. Reconstruir el borde uniendo puntos
 * ordenados por ángulo solo describe formas compactas; sobre el canal o una
 * vértebra fragmentada unía puntos que no correspondían y dibujaba una figura que
 * la IA nunca segmentó. El mapa es exacto por construcción.
 */

export type SegmentationInstance = {
  index: number;
  id: string;
  label: string;
  classKey: string;
  level?: string | null;
};

/**
 * Nombre de una instancia para la leyenda.
 *
 * La clase sola no alcanza: un arco posterior y un cuerpo vertebral llegan los dos
 * como `vertebra_group`, así que la lista mostraba nueve renglones idénticos que
 * decían "Grupo vertebral" y no dejaban saber cuál era cuál. Se prefiere la
 * estructura, que sí los separa, y se le agrega el nivel cuando se pudo asignar.
 *
 * El cuerpo se nombra solo por su nivel ("L4") porque es como se lo nombra al
 * dictar; el arco lleva estructura y nivel ("Arco posterior L4") porque decir "L4"
 * a secas ya está tomado por el cuerpo.
 */
export function instanceLabel(
  instance: SegmentationInstance,
  translate: (value: string | null | undefined) => string,
) {
  const level = instance.level ?? undefined;
  if (instance.label === "vertebra") return level ?? translate(instance.label);
  const structure = translate(instance.label || instance.classKey);
  return level ? `${structure} ${level}` : structure;
}

export type Segmentation = {
  encoding: "rle-v1";
  width: number;
  height: number;
  data: number[];
  instances: SegmentationInstance[];
};

/**
 * Paleta cualitativa. No codifica clase ni severidad: su único trabajo es que dos
 * estructuras vecinas no compartan color, para que se vea si la IA separó los
 * discos donde correspondía o fusionó dos.
 */
export const INSTANCE_COLORS = [
  "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#bfef45", "#fabed4",
  "#469990", "#dcbeff", "#9a6324", "#800000", "#808000",
];

export function instanceColor(index: number) {
  return INSTANCE_COLORS[(index - 1 + INSTANCE_COLORS.length) % INSTANCE_COLORS.length];
}

const VERTEBRAL_LEVEL_COLORS: Readonly<Record<string, string>> = {
  L1: INSTANCE_COLORS[0],
  L2: INSTANCE_COLORS[1],
  L3: INSTANCE_COLORS[2],
  L4: INSTANCE_COLORS[3],
  L5: INSTANCE_COLORS[4],
};

/**
 * Resuelve únicamente el color de presentación de una instancia.
 *
 * El nivel canónico ya llega en metadata; no se infiere desde nombres ni IDs. Los
 * cuerpos y elementos posteriores comparten `vertebra_group`, por lo que pueden
 * usar una identidad cromática común sin modificar clase, índice ni máscara.
 */
export function resolveSegmentationDisplayColor(instance: SegmentationInstance) {
  if (instance.classKey === "vertebra_group" && instance.level) {
    return VERTEBRAL_LEVEL_COLORS[instance.level] ?? instanceColor(instance.index);
  }
  return instanceColor(instance.index);
}

/** Lee la segmentación de un plano, o undefined si no viaja o está incompleta. */
export function parseSegmentation(value: unknown): Segmentation | undefined {
  const raw = value as Partial<Segmentation> | undefined;
  if (!raw || raw.encoding !== "rle-v1") return undefined;
  const { width, height, data } = raw;
  if (typeof width !== "number" || typeof height !== "number" || !Array.isArray(data)) return undefined;
  if (data.length === 0 || data.length % 2 !== 0) return undefined;
  // Un RLE que no cubre exactamente la imagen pintaría regiones donde no las hay.
  let covered = 0;
  for (let index = 1; index < data.length; index += 2) covered += data[index];
  if (covered !== width * height) return undefined;
  const instances = Array.isArray(raw.instances) ? raw.instances : [];
  return { encoding: "rle-v1", width, height, data, instances };
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

/**
 * Expande el RLE a píxeles RGBA, con un color por instancia.
 *
 * `hidden` lleva los índices que el revisor apagó; se saltean en vez de pintarse
 * transparentes para no recorrer dos veces la imagen.
 */
export function paintSegmentation(
  segmentation: Segmentation,
  hidden: ReadonlySet<number>,
): ImageData {
  const { width, height, data } = segmentation;
  const image = new ImageData(width, height);
  const pixels = image.data;
  const colors = new Map<number, readonly [number, number, number]>();
  for (const instance of segmentation.instances) {
    colors.set(instance.index, hexToRgb(resolveSegmentationDisplayColor(instance)));
  }

  let offset = 0;
  for (let cursor = 0; cursor < data.length; cursor += 2) {
    const value = data[cursor];
    const length = data[cursor + 1];
    if (value !== 0 && !hidden.has(value)) {
      const color = colors.get(value) ?? hexToRgb(instanceColor(value));
      for (let step = 0; step < length; step += 1) {
        const pixel = (offset + step) * 4;
        pixels[pixel] = color[0];
        pixels[pixel + 1] = color[1];
        pixels[pixel + 2] = color[2];
        pixels[pixel + 3] = 255;
      }
    }
    offset += length;
  }
  return image;
}

/** Instancia que ocupa un píxel, para saber qué estructura se clickeó. */
export function instanceAt(segmentation: Segmentation, x: number, y: number): number {
  const { width, height, data } = segmentation;
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const target = Math.floor(y) * width + Math.floor(x);
  let offset = 0;
  for (let cursor = 0; cursor < data.length; cursor += 2) {
    offset += data[cursor + 1];
    if (target < offset) return data[cursor];
  }
  return 0;
}
