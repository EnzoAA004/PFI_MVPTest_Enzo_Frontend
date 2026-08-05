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
function Plate({ x, y, text, size }: { x: number; y: number; text: string; size: number }) {
  const width = text.length * size * 0.62 + size * 0.7;
  const height = size * 1.5;
  return (
    <g className="mri-measure-plate">
      <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={size * 0.3} />
      <text x={x} y={y} fontSize={size}>{text}</text>
    </g>
  );
}

/** Dónde apoyar la placa de cada tipo, sin taparle la estructura que mide. */
function plateAnchor(kind: MeasurementKind, points: AnnotationPoint[], gap: number): AnnotationPoint {
  if (kind === "probe") return { x: points[0].x, y: points[0].y - gap };
  if (kind === "roi") {
    const top = points.reduce((best, point) => (point.y < best.y ? point : best), points[0]);
    return { x: top.x, y: top.y - gap };
  }
  if (kind === "angle" && points.length >= 4) {
    // En el vértice del ángulo, que es donde el médico mira para juzgarlo.
    return { x: (points[1].x + points[2].x) / 2, y: (points[1].y + points[2].y) / 2 - gap };
  }
  if (kind === "listhesis" && points.length >= 3) {
    return { x: points[2].x, y: points[2].y - gap };
  }
  // Distancia: fuera de la línea, corrido a lo largo de su propia dirección, para no
  // quedar encima de lo que se está midiendo.
  const [from, to] = points;
  const direction = unitVector(from, to);
  return { x: to.x + direction.x * gap, y: to.y + direction.y * gap };
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
  const fontSize = 6 / zoom;
  const tick = 2.2 / zoom;
  const handle = 2.4 / zoom;
  const gap = fontSize * 1.1;
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
        const anchor = plateAnchor(figure.kind, figure.points, gap);
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
            {figure.label && <Plate x={anchor.x} y={anchor.y} text={figure.label} size={fontSize} />}
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
