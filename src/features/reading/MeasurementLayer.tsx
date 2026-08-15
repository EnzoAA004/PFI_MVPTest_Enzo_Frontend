import type { PointerEvent } from "react";
import type { AnnotationPoint } from "./annotations";
import type { MeasurementKind } from "./measurements";

/**
 * Las cotas sobre la imagen.
 *
 * Una cota tiene que leerse como una medición y no como una marca cualquiera. Por eso
 * lleva marcas perpendiculares en las puntas —la convención de un plano acotado— en
 * vez de puntos: en esta misma imagen ya hay puntos, son los landmarks, y usar la
 * misma forma para dos cosas distintas obliga al médico a adivinar cuál es cuál.
 *
 * El valor va en una placa opaca. Un texto con contorno se pierde igual sobre grasa
 * brillante o sobre hueso, y el corte cambia de brillo justo donde están las
 * estructuras que se miden.
 *
 * Tres estados, y la diferencia es funcional además de visual: en reposo se ve la
 * medición; resaltada es la fila que el médico está mirando en el panel; seleccionada
 * es la única que muestra tiradores y se puede arrastrar. Que los tiradores aparezcan
 * solo en una es lo que saca la mayor parte del ruido de la imagen, y hace de editar
 * un acto deliberado en vez de un accidente del mouse.
 */

export type MeasurementFigure = {
  id: string;
  kind: MeasurementKind;
  /** En la base 0..256 del `coordinateSpace` del plano. */
  points: AnnotationPoint[];
  label: string;
  source: "ai" | "reviewer" | "derived";
  /** Medición de la tabla a la que corresponde, cuando arrastrarla la corrige. */
  measurementId?: string;
};

type Props = {
  figures: MeasurementFigure[];
  /** Dónde corta el otro plano, cuando la geometría lo sostiene. */
  referenceLine?: [AnnotationPoint, AnnotationPoint] | null;
  /** En curso: la figura que el médico está trazando ahora mismo. */
  draft?: { kind: MeasurementKind; points: AnnotationPoint[] } | null;
  selectedId?: string | null;
  highlightedId?: string | null;
  /**
   * Todo lo que no es la imagen se divide por el zoom.
   *
   * El SVG escala junto con el corte, así que sin compensar, una placa ocuparía
   * siempre la misma fracción de la anatomía: acercarse no la achicaría. Dividir deja
   * el texto y las marcas de tamaño constante en pantalla, que es como se comporta
   * cualquier estación de lectura.
   */
  zoom: number;
  editable: boolean;
  onSelect?: (id: string) => void;
  onMovePoint?: (id: string, index: number, point: AnnotationPoint) => void;
  onDragStart?: (event: PointerEvent<SVGCircleElement>, id: string, index: number) => void;
};

const BASE = 256;

function unitVector(from: AnnotationPoint, to: AnnotationPoint) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

/** Marca perpendicular en una punta: la que dice "acá termina lo que se midió". */
function Tick({ at, along, size }: { at: AnnotationPoint; along: AnnotationPoint; size: number }) {
  const direction = unitVector(at, along);
  return (
    <line
      x1={at.x + direction.y * size}
      y1={at.y - direction.x * size}
      x2={at.x - direction.y * size}
      y2={at.y + direction.x * size}
    />
  );
}

/**
 * Placa con el valor.
 *
 * El ancho sale del largo del texto porque un SVG no ajusta una caja a su contenido:
 * se estima en anchos de carácter de una tipografía monoespaciada, que es la que usa
 * el visor justamente porque cada carácter mide lo mismo.
 */
function plateWidth(text: string, size: number) {
  return text.length * size * 0.62 + size * 0.7;
}

type Box = { x: number; y: number; w: number; h: number };

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function Plate({ x, y, text, size }: { x: number; y: number; text: string; size: number }) {
  const width = plateWidth(text, size);
  const height = size * 1.5;
  return (
    <g className="mri-measure-plate">
      <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={size * 0.3} />
      <text x={x} y={y} fontSize={size}>{text}</text>
    </g>
  );
}

/**
 * Desde qué punto se aparta la placa de cada tipo.
 *
 * Es el lugar que la medición "señala": el que el médico mira para juzgarla. La
 * placa no se apoya ahí sino a una distancia de ahí.
 */
function plateBase(kind: MeasurementKind, points: AnnotationPoint[]): AnnotationPoint {
  if (kind === "probe") return points[0];
  if (kind === "roi") return points.reduce((best, point) => (point.y < best.y ? point : best), points[0]);
  // En el vértice del ángulo, que es donde el médico mira para juzgarlo.
  if (kind === "angle" && points.length >= 4) {
    return { x: (points[1].x + points[2].x) / 2, y: (points[1].y + points[2].y) / 2 };
  }
  if (kind === "listhesis" && points.length >= 3) return points[2];
  const [from, to] = points;
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

/**
 * Hacia dónde apartarla.
 *
 * En una distancia, perpendicular a la propia línea. Antes se corría a lo largo de
 * su dirección, más allá del extremo, y ahí es justo donde está el tirador para
 * arrastrarla: en una cota horizontal la tapaba con media placa entera. Se notaba
 * sobre todo en el axial, donde las cotas son cortas y la placa mide lo mismo que
 * en cualquier otro plano.
 *
 * Perpendicular y desde el medio despeja los dos extremos de una vez, que es
 * además donde el ojo espera leer la medida de un segmento.
 */
function plateDirection(kind: MeasurementKind, points: AnnotationPoint[]): AnnotationPoint {
  if (kind !== "distance" || points.length < 2) return { x: 0, y: -1 };
  const direction = unitVector(points[0], points[1]);
  const normal = { x: -direction.y, y: direction.x };
  // Siempre hacia arriba, para que dos cotas paralelas no se lean una a cada lado.
  return normal.y > 0 ? { x: -normal.x, y: -normal.y } : normal;
}

function Figure({ figure, kind, tick }: { figure: MeasurementFigure; kind: MeasurementKind; tick: number }) {
  const { points } = figure;
  if (kind === "probe") {
    return (
      <>
        <line x1={points[0].x - tick} y1={points[0].y} x2={points[0].x + tick} y2={points[0].y} />
        <line x1={points[0].x} y1={points[0].y - tick} x2={points[0].x} y2={points[0].y + tick} />
      </>
    );
  }
  if (kind === "roi") {
    return <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} className="mri-measure-roi" />;
  }
  if (kind === "angle") {
    return (
      <>
        <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} />
        {points.length >= 4 && <line x1={points[2].x} y1={points[2].y} x2={points[3].x} y2={points[3].y} />}
      </>
    );
  }
  if (kind === "listhesis") {
    return (
      <>
        {/* El platillo, que da la dirección contra la que se mide el corrimiento. */}
        <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} />
        {points.length >= 3 && (
          <line className="mri-measure-slip" x1={points[1].x} y1={points[1].y} x2={points[2].x} y2={points[2].y} />
        )}
      </>
    );
  }
  return (
    <>
      <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} />
      <Tick at={points[0]} along={points[1]} size={tick} />
      <Tick at={points[1]} along={points[0]} size={tick} />
    </>
  );
}

export function MeasurementLayer({
  figures, draft, referenceLine, selectedId, highlightedId, zoom, editable, onSelect, onDragStart,
}: Props) {
  /*
   * 8 y no 6: medido sobre la aplicacion, el valor anterior renderizaba a 10 px de
   * alto en pantalla, que es chico para leer un numero clinico de un vistazo. Las
   * estaciones de lectura rondan los 12-14. La division por el zoom es lo que
   * mantiene ese tamano constante mientras la anatomia crece.
   *
   * Subirlo no es gratis: la placa se dimensiona a partir de esta constante, asi que
   * un numero mas grande empuja mas lejos a las placas que se estorban entre si -en
   * el axial son ocho sobre la misma estructura-. 8 es lo que entra sin que esa
   * columna se desarme.
   */
  const fontSize = 8 / zoom;
  const tick = 2.2 / zoom;
  const handle = 2.4 / zoom;
  /*
   * Media altura de la placa + el radio del tirador + un respiro. Deducido y no
   * elegido: con el valor de antes la placa quedaba a 2.1 de un tirador de 2.4 de
   * radio, así que lo tapaba siempre.
   */
  const clearance = (fontSize * 1.5) / 2 + handle + fontSize * 0.35;
  /*
   * Apartar cada placa de su propio punto no alcanza cuando hay muchas. En el axial
   * ocho cotas cruzan la misma estructura, sus centros caen casi en el mismo lugar
   * y las placas terminan apiladas unas sobre otras, que es tan ilegible como
   * taparle el extremo a la cota. Así que se ubican de a una y, si la que sigue
   * pisa a una ya puesta, se aleja otro escalón por su propia perpendicular hasta
   * encontrar hueco. Con tope de intentos: sin él una cota podría irse del corte.
   */
  const plateHeight = fontSize * 1.5;
  const anchors = new Map<string, AnnotationPoint>();
  const placed: Box[] = [];
  for (const figure of figures) {
    if (!figure.points.length || !figure.label) continue;
    const base = plateBase(figure.kind, figure.points);
    const direction = plateDirection(figure.kind, figure.points);
    const width = plateWidth(figure.label, fontSize);
    const at = (distance: number) => ({ x: base.x + direction.x * distance, y: base.y + direction.y * distance });
    const boxAt = (point: AnnotationPoint): Box => ({ x: point.x - width / 2, y: point.y - plateHeight / 2, w: width, h: plateHeight });
    let anchor = at(clearance);
    for (let step = 1; step <= 6 && placed.some((other) => overlaps(other, boxAt(anchor))); step += 1) {
      anchor = at(clearance + step * plateHeight * 1.25);
    }
    placed.push(boxAt(anchor));
    anchors.set(figure.id, anchor);
  }
  if (!figures.length && !draft && !referenceLine) return null;

  return (
    <svg className="mri-measure-layer" viewBox={`0 0 ${BASE} ${BASE}`} preserveAspectRatio="none">
      {/*
        Dónde corta el otro plano. Va primero para quedar debajo de las mediciones: es
        contexto de navegación, no un hallazgo, y no debe competir con lo que se mide.
      */}
      {referenceLine && (
        <line
          className="mri-reference-line"
          x1={referenceLine[0].x}
          y1={referenceLine[0].y}
          x2={referenceLine[1].x}
          y2={referenceLine[1].y}
        />
      )}
      {figures.map((figure) => {
        if (!figure.points.length) return null;
        const selected = figure.id === selectedId;
        const state = selected ? " is-selected" : figure.id === highlightedId ? " is-highlighted" : "";
        return (
          <g
            className={`mri-measure mri-measure-${figure.source}${state}`}
            key={figure.id}
            onPointerDown={onSelect ? () => onSelect(figure.id) : undefined}
          >
            {/* Franja invisible y ancha: acertarle a una línea de un píxel con el
                mouse es imposible, y sin esto seleccionar una cota sería una lotería. */}
            {figure.points.length >= 2 && (
              <line
                className="mri-measure-hit"
                x1={figure.points[0].x}
                y1={figure.points[0].y}
                x2={figure.points[1].x}
                y2={figure.points[1].y}
                strokeWidth={handle * 2}
              />
            )}
            <Figure figure={figure} kind={figure.kind} tick={tick} />
            {selected && editable && figure.points.map((point, index) => (
              <circle
                className="mri-measure-handle"
                cx={point.x}
                cy={point.y}
                key={index}
                onPointerDown={(event) => onDragStart?.(event, figure.measurementId ?? figure.id, index)}
                r={handle}
              />
            ))}
          </g>
        );
      })}
      {/*
        * Las placas van en una segunda pasada, sobre todas las figuras.
        *
        * Dibujadas dentro del grupo de su propia cota quedaban a merced del orden: la
        * linea de una cota posterior se pintaba encima de la placa de una anterior y
        * le tachaba el numero. Con el texto chico apenas se notaba; agrandarlo lo hizo
        * evidente, y un numero tachado es justo lo que un valor clinico no puede ser.
        *
        * Van fuera del grupo que escucha el clic a proposito: la placa no selecciona.
        * Esta corrida al costado de la cota, asi que apretarla seleccionaria algo que
        * no esta debajo del cursor.
        */}
      {figures.map((figure) => {
        if (!figure.points.length || !figure.label) return null;
        const anchor = anchors.get(figure.id) ?? plateBase(figure.kind, figure.points);
        const selected = figure.id === selectedId;
        const state = selected ? " is-selected" : figure.id === highlightedId ? " is-highlighted" : "";
        return (
          <g className={`mri-measure mri-measure-${figure.source}${state}`} key={`plate-${figure.id}`}>
            <Plate x={anchor.x} y={anchor.y} text={figure.label} size={fontSize} />
          </g>
        );
      })}
      {draft && draft.points.length > 0 && (
        <g className="mri-measure mri-measure-draft">
          {draft.points.length >= 2 && (
            <Figure
              figure={{ id: "draft", kind: draft.kind, points: draft.points, label: "", source: "reviewer" }}
              kind={draft.kind}
              tick={tick}
            />
          )}
          {draft.points.map((point, index) => (
            <circle cx={point.x} cy={point.y} key={index} r={handle} />
          ))}
        </g>
      )}
    </svg>
  );
}
