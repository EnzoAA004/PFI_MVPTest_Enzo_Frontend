/**
 * Línea de referencia entre planos: dónde corta el axial al sagital, y al revés.
 *
 * Es lo que hace que mirar los dos planos juntos sirva. Sin ella el médico ve una
 * hernia en el sagital y tiene que adivinar cuál de los quince cortes axiales le
 * corresponde.
 *
 * Todo el módulo está construido alrededor de una regla: **la línea se traza solo con
 * geometría verificada**. Una línea dibujada sobre coordenadas que no son comparables
 * no es una aproximación, es una afirmación falsa sobre dónde está una estructura — y
 * se ve exactamente igual de convincente que una correcta.
 */

export type Vec3 = [number, number, number];

/** Plano del corte que se está mostrando, en coordenadas del paciente. */
export type SlicePlane = {
  /** Origen del píxel (0,0) del corte. */
  position: Vec3;
  rowDirection: Vec3;
  colDirection: Vec3;
  normal: Vec3;
  rowSpacing: number;
  colSpacing: number;
  rowCount: number;
  colCount: number;
  /** De dónde salió la posición: declarada por el corte, o supuesta uniforme. */
  positionSource?: "declared" | "uniform_spacing";
};

export type VolumeGeometry = {
  slicePlane?: SlicePlane | null;
  /** Posición declarada de cada corte de la serie, en coordenadas del paciente. */
  slicePositions?: Vec3[] | null;
  boundsMm?: { min: Vec3; max: Vec3 } | null;
  frameOfReferenceUid?: string | null;
  geometryComplete?: boolean;
  sliceSpacingUniform?: boolean;
};

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function parseVolumeGeometry(value: unknown): VolumeGeometry | null {
  const raw = value as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  const plane = raw.slicePlane as Record<string, unknown> | null | undefined;
  const bounds = raw.boundsMm as Record<string, unknown> | null | undefined;
  const slicePlane: SlicePlane | null = plane
    && isVec3(plane.position) && isVec3(plane.rowDirection) && isVec3(plane.colDirection) && isVec3(plane.normal)
    && typeof plane.rowSpacing === "number" && typeof plane.colSpacing === "number"
    && typeof plane.rowCount === "number" && typeof plane.colCount === "number"
    ? {
      position: plane.position,
      rowDirection: plane.rowDirection,
      colDirection: plane.colDirection,
      normal: plane.normal,
      rowSpacing: plane.rowSpacing,
      colSpacing: plane.colSpacing,
      rowCount: plane.rowCount,
      colCount: plane.colCount,
      positionSource: plane.positionSource === "declared" ? "declared" : "uniform_spacing",
    }
    : null;
  const positions = Array.isArray(raw.slicePositions)
    ? (raw.slicePositions as unknown[]).filter(isVec3)
    : null;
  return {
    slicePlane,
    slicePositions: positions && positions.length ? positions : null,
    boundsMm: bounds && isVec3(bounds.min) && isVec3(bounds.max) ? { min: bounds.min, max: bounds.max } : null,
    frameOfReferenceUid: typeof raw.frameOfReferenceUid === "string" ? raw.frameOfReferenceUid : null,
    geometryComplete: raw.geometryComplete === true,
    sliceSpacingUniform: raw.sliceSpacingUniform === true,
  };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export type CoordinateEvidence =
  | { shared: true; basis: "frame_of_reference" | "geometry" }
  | { shared: false; reason: string };

/**
 * Si dos volúmenes están en el mismo sistema de coordenadas, y con qué evidencia.
 *
 * El `frameOfReferenceUid` es la garantía declarada, y cuando coincide no hace falta
 * nada más. Pero la anonimización de este dataset lo regenera por serie: las
 * posiciones siguen siendo coherentes y el identificador ya no lo dice. Confiar solo
 * en él rechazaría geometría buena en los 516 casos.
 *
 * Por eso hay un segundo nivel, verificable: que las cajas de los dos volúmenes se
 * solapen y que cada una contenga el centro de la otra. Dos estudios distintos no
 * cumplen eso — quedan a decenas de centímetros. Y la pantalla dice cuál de las dos
 * evidencias sostiene la línea, porque no valen lo mismo.
 */
export function coordinateEvidence(target: VolumeGeometry, source: VolumeGeometry): CoordinateEvidence {
  if (!target.geometryComplete || !source.geometryComplete) {
    return { shared: false, reason: "El estudio no informa geometría completa en los dos planos." };
  }
  if (target.frameOfReferenceUid && target.frameOfReferenceUid === source.frameOfReferenceUid) {
    return { shared: true, basis: "frame_of_reference" };
  }
  const a = target.boundsMm;
  const b = source.boundsMm;
  if (!a || !b) {
    return { shared: false, reason: "Los planos no declaran el mismo marco de referencia y no hay geometría para verificarlo." };
  }
  const overlap = [0, 1, 2].map((axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]));
  const centerOf = (box: { min: Vec3; max: Vec3 }) => [0, 1, 2].map((axis) => (box.min[axis] + box.max[axis]) / 2);
  const inside = (point: number[], box: { min: Vec3; max: Vec3 }) =>
    point.every((value, axis) => value >= box.min[axis] && value <= box.max[axis]);
  if (overlap.some((value) => value <= 0) || !inside(centerOf(a), b) || !inside(centerOf(b), a)) {
    return { shared: false, reason: "Los dos planos no ocupan el mismo espacio: no son series del mismo estudio." };
  }
  return { shared: true, basis: "geometry" };
}

/**
 * El plano del corte `index`, y no el del corte que analizó la IA.
 *
 * Es lo que hace que la línea se mueva mientras el médico recorre la serie. La
 * posición sale de la que declara cada corte: extrapolarla como
 * `origen + N x espaciado` es correcto solo en una serie sin huecos, y las series
 * axiales de este dataset los tienen. Cuando la serie no declara posiciones —un
 * volumen .mha, que por construcción es uniforme— se cae a esa cuenta.
 */
export function slicePlaneAt(geometry: VolumeGeometry, index: number): SlicePlane | null {
  const base = geometry.slicePlane;
  if (!base) return null;
  const declared = geometry.slicePositions?.[index];
  if (declared) return { ...base, position: declared };
  const reference = geometry.slicePositions?.length ? null : base;
  if (!reference) return null;
  // Sin posiciones declaradas: la serie es uniforme y el desplazamiento vale.
  return base;
}

export type Point2 = { x: number; y: number };

/**
 * Resuelve un sistema 3×3 por la regla de Cramer.
 *
 * Devuelve null cuando el determinante es despreciable, que geométricamente significa
 * que los planos no se cortan en una recta única.
 */
function solve3(rows: [Vec3, Vec3, Vec3], values: Vec3): Vec3 | null {
  const det = (m: [Vec3, Vec3, Vec3]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const base = det(rows);
  if (Math.abs(base) < 1e-9) return null;
  const replaced = (column: number): [Vec3, Vec3, Vec3] =>
    rows.map((row, index) => row.map((value, axis) => (axis === column ? values[index] : value)) as Vec3) as [Vec3, Vec3, Vec3];
  return [det(replaced(0)) / base, det(replaced(1)) / base, det(replaced(2)) / base];
}

/** Recorta un segmento paramétrico al rectángulo [0,width]×[0,height]. */
function clipToRect(from: Point2, to: Point2, width: number, height: number): [Point2, Point2] | null {
  let low = 0;
  let high = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const edges: [number, number][] = [[-dx, from.x], [dx, width - from.x], [-dy, from.y], [dy, height - from.y]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > high) return null;
      if (r > low) low = r;
    } else {
      if (r < low) return null;
      if (r < high) high = r;
    }
  }
  return [
    { x: from.x + low * dx, y: from.y + low * dy },
    { x: from.x + high * dx, y: from.y + high * dy },
  ];
}

/**
 * Dónde corta el plano de `source` a la imagen de `target`, en la base 0..256.
 *
 * Devuelve null cuando los planos son paralelos —no se cortan en una recta— o cuando
 * la recta no pasa por la imagen visible. Ese último caso es normal y no es un error:
 * en un estudio lumbar los cortes axiales cubren solo la parte baja, así que al
 * recorrer el sagital hacia arriba la línea deja de existir. Dibujarla igual, pegada
 * al borde, diría que el axial corta donde no corta.
 */
export function referenceLineOn(target: SlicePlane, source: SlicePlane): [Point2, Point2] | null {
  const direction = cross(target.normal, source.normal);
  if (norm(direction) < 1e-6) return null;

  const point = solve3(
    [target.normal, source.normal, direction],
    [dot(target.normal, target.position), dot(source.normal, source.position), 0],
  );
  if (!point) return null;

  const toImage = (world: Vec3): Point2 => {
    const relative = sub(world, target.position);
    return {
      x: dot(relative, target.colDirection) / target.colSpacing,
      y: dot(relative, target.rowDirection) / target.rowSpacing,
    };
  };
  // Dos puntos separados de la recta; el largo no importa porque después se recorta.
  const span = Math.max(target.rowCount * target.rowSpacing, target.colCount * target.colSpacing);
  const a = toImage(point);
  const b = toImage([
    point[0] + direction[0] * span,
    point[1] + direction[1] * span,
    point[2] + direction[2] * span,
  ] as Vec3);

  const clipped = clipToRect(a, b, target.colCount, target.rowCount);
  if (!clipped) return null;
  return clipped.map((item) => ({
    x: item.x / target.colCount * 256,
    y: item.y / target.rowCount * 256,
  })) as [Point2, Point2];
}
