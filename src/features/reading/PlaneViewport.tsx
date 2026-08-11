import { useEffect, useRef, useState } from "react";
import type { OrientationLabels } from "./orientationMarkers";
import { MriSliceViewer, type MeasurementOverlay, type RawSlicePixels, type SliceNavigation } from "../../components/MriSliceViewer";
import { instanceLabel, resolveSegmentationDisplayColor, type Segmentation } from "./segmentation";
import { displayStructureLabel } from "../../clinicalDisplay";
import type { StudyArchiveSeries } from "../../appTypes";
import type { SlicePixelsMeta } from "./pixels";
import type { MeasurementKind } from "./measurements";
import type { studyRunToMriViewerModel } from "../../viewModels/mriViewerViewModel";

/*
 * Ritmo del cine. Un PACS ronda los 10-15 cuadros por segundo, pero acá cada corte se
 * descarga entero: a esa velocidad la red no llega y el cine muestra el corte anterior.
 */
const CINE_INTERVAL_MS = 200;

/**
 * Cómo se lista una serie en el selector.
 *
 * Lleva la cantidad de cortes porque es lo que distingue dos series que el equipo
 * describió igual, y marca el localizer y las capturas de consola: son navegables, pero
 * saber que lo son evita que el médico las lea como una adquisición más.
 */
function seriesOptionLabel(series: StudyArchiveSeries) {
  const weighting = series.weighting === "t1" || series.weighting === "t2" ? ` ${series.weighting.toUpperCase()}` : "";
  const kind = series.multiplanar ? " · localizer" : series.derived ? " · captura de consola" : "";
  return `${series.description || "Serie sin descripción"}${weighting} · ${series.sliceCount} cortes${kind}`;
}

export type PlaneViewportProps = {
  plane: "sagittal" | "axial";
  caseLabel: string;
  seriesName: string;
  seriesRoleLabel: "Analizada IA" | "Referencia";
  model: ReturnType<typeof studyRunToMriViewerModel>;
  spacingLabel: string;
  slice?: SliceNavigation;
  active: boolean;
  onActivate: () => void;
  selectedLandmarkId: string;
  onSelectLandmark: (id: string) => void;
  readonly: boolean;
  addMode: boolean;
  /** Marcado del receso subarticular: solo lo activa el viewport axial. */
  subarticularMode?: boolean;
  onSubarticularPoint?: (point: { x: number; y: number }, frame: { width: number; height: number }) => void;
  /** Letras de orientación del corte visible, o null si la serie no la declara. */
  orientation?: OrientationLabels | null;
  /** Espaciado del pixel en mm, [entre filas, entre columnas], para la barra de escala. */
  pixelSpacingMm?: [number, number] | null;
  onMoveLandmark: (landmarkId: string, point: { x: number; y: number }) => void;
  onAddLandmark: (point: { x: number; y: number }) => void;
  onLandmarkAddComplete: () => void;
  onOverlayAvailableChange: (available: boolean) => void;
  measureTool: MeasurementKind | null;
  measureDraft: { x: number; y: number }[];
  onMeasurePoint: (point: { x: number; y: number }, frame: { width: number; height: number }, pixels: RawSlicePixels | null) => void;
  onMeasureFreehand: (points: { x: number; y: number }[], frame: { width: number; height: number }, pixels: RawSlicePixels | null) => void;
  annotations: MeasurementOverlay[];
  /** Segmentos de las mediciones de la IA, con sus extremos reales. */
  aiMeasurements: MeasurementOverlay[];
  /** Cuántas mediciones dibujables tiene la corrida, con o sin nivel seleccionado. */
  aiMeasurableCount: number;
  /** Derivadas de la geometría de otras estructuras: capa aparte. */
  derivedMeasurements: MeasurementOverlay[];
  derivedMeasurableCount: number;
  referenceLine: [{ x: number; y: number }, { x: number; y: number }] | null;
  referenceLineReason: string;
  selectedMeasurementId: string | null;
  highlightedMeasurementId: string | null;
  onSelectMeasurement: (id: string) => void;
  onMoveMeasurePoint: (measurementId: string, end: "from" | "to", point: { x: number; y: number }, frame: { width: number; height: number }) => void;
  onMoveMaskPoint: (maskId: string, pointIndex: number, point: { x: number; y: number }) => void;
  segmentation?: Segmentation;
  slicePixels?: SlicePixelsMeta;
  pixelsBaseUrl?: string;
  hiddenInstances: number[];
  onToggleInstance: (index: number) => void;
  /** Cortes de este plano con anotaciones, para marcarlos en la barra de stack. */
  annotatedIndices?: Set<number>;
  /** Series del estudio que se pueden mostrar en este viewport. */
  seriesChoices: StudyArchiveSeries[];
  /** `null` es la serie que analizó la IA, que es la que trae la segmentación. */
  viewedSeriesId: string | null;
  /** Nombre de la serie analizada, para poder volver a ella desde el selector. */
  analyzedSeriesName: string | null;
  /** Por qué la serie que se está viendo no tiene segmentación. Vacío si la tiene. */
  unsegmentedReason: string;
  onSelectSeries: (inputId: string | null) => void;
};

/**
 * Un plano de la sala de lectura: imagen, anotaciones de esquina y barra de stack.
 *
 * Se extrae para poder montar sagital y axial a la vez. Cada viewport mantiene su
 * propio corte porque los stacks son independientes: 17 cortes sagitales y 12
 * axiales no se recorren con el mismo índice.
 */
export function PlaneViewport({
  plane, caseLabel, seriesName, seriesRoleLabel, model, spacingLabel,
  slice, active, onActivate, selectedLandmarkId, onSelectLandmark, readonly, addMode,
  subarticularMode, onSubarticularPoint, orientation, pixelSpacingMm,
  onMoveLandmark, onAddLandmark, onLandmarkAddComplete, onOverlayAvailableChange,
  measureTool, measureDraft, onMeasurePoint, onMeasureFreehand, annotations, aiMeasurements, aiMeasurableCount,
  derivedMeasurements, derivedMeasurableCount, referenceLine, referenceLineReason, onMoveMeasurePoint, annotatedIndices, onMoveMaskPoint,
  selectedMeasurementId, highlightedMeasurementId, onSelectMeasurement,
  segmentation, slicePixels, pixelsBaseUrl, hiddenInstances, onToggleInstance,
  seriesChoices, viewedSeriesId, analyzedSeriesName, unsegmentedReason, onSelectSeries,
}: PlaneViewportProps) {
  /*
   * Cine: recorrer la serie sola, que es como se lee un stack cuando se busca por
   * dónde entra una hernia. Va y vuelve en vez de saltar del último al primero: el
   * salto se lee como un corte de continuidad y obliga a reubicarse cada vuelta.
   *
   * Se detiene al llegar a una punta si el usuario arrastró el slider mientras corría,
   * y se apaga sola cuando el plano deja de estar activo — dos series corriendo a la
   * vez no se pueden mirar, y la de atrás solo gasta descargas de cortes.
   */
  const [cineOn, setCineOn] = useState(false);
  // Ventana y nivel, reportados por el visor. Se muestran en la esquina de parametros,
  // que es donde los pone un PACS y donde el medico los busca.
  const [displayParams, setDisplayParams] = useState("");
  const cineDirection = useRef(1);
  const total = slice?.total ?? 0;
  const step = slice?.onStep;
  const current = slice?.current ?? 0;

  useEffect(() => {
    if (!active) setCineOn(false);
  }, [active]);

  useEffect(() => {
    if (!cineOn || !step || total < 2) return;
    const timer = setInterval(() => {
      if (current + cineDirection.current >= total) cineDirection.current = -1;
      else if (current + cineDirection.current < 0) cineDirection.current = 1;
      step(cineDirection.current);
    }, CINE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [cineOn, current, step, total]);

  const sliceLabel = slice ? `corte ${slice.current + 1}/${slice.total}` : "corte único";
  return (
    <section className={`rr-plane${active ? " is-active" : ""}`} onPointerDownCapture={onActivate}>
      {/*
        Selector de serie del viewport.

        Separa dos cosas que estaban pegadas: la serie que se muestra y la serie sobre
        la que corrió la IA. Un estudio trae siete series y el modelo analiza dos, pero
        el médico lee todas — la T1 es la que distingue un hemangioma de una metástasis
        y ningún modelo la toca. Solo aparece cuando el estudio trajo alternativas: con
        una sola serie por plano el control sería una lista de un elemento.
      */}
      {seriesChoices.length > 1 && (
        <div className="rr-series-picker">
          <label>
            <span>Serie</span>
            <select
              onChange={(event) => onSelectSeries(event.target.value || null)}
              value={viewedSeriesId ?? ""}
            >
              <option value="">
                {analyzedSeriesName ? `${analyzedSeriesName} — analizada por la IA` : "Serie analizada por la IA"}
              </option>
              {seriesChoices.map((item) => (
                <option key={item.inputId} value={item.inputId}>
                  {seriesOptionLabel(item)}
                </option>
              ))}
            </select>
          </label>
          {/*
            El motivo va siempre que se mire otra serie. Una imagen sin máscaras y sin
            explicación se lee como que la segmentación falló, cuando lo que pasa es
            que sobre esta serie nunca corrió: son dos situaciones distintas y la
            segunda no es un error.
          */}
          {unsegmentedReason && <p className="rr-series-note">{unsegmentedReason}</p>}
        </div>
      )}
      <div className="rr-viewport">
        <div className="rr-corner rr-corner-tl"><strong>{caseLabel}</strong></div>
        <div className="rr-corner rr-corner-tr">
          <strong>{seriesName}</strong>
          {sliceLabel}{"\n"}<span className="rr-viewport-role">{seriesRoleLabel}</span>
        </div>
        {/* W/L es información de lectura. Modelo y modo viven en Más → Técnico. */}
        <div className="rr-corner rr-corner-bl">
          {displayParams}
        </div>
        <div className="rr-corner rr-corner-br">
          {spacingLabel}
        </div>
        <MriSliceViewer
          model={model}
          selectedLandmarkId={selectedLandmarkId}
          onSelectLandmark={onSelectLandmark}
          readonly={readonly}
          addMode={addMode}
          subarticularMode={subarticularMode}
          onSubarticularPoint={onSubarticularPoint}
          orientation={orientation}
          pixelSpacingMm={pixelSpacingMm}
          onDisplayParamsChange={setDisplayParams}
          onMoveLandmark={onMoveLandmark}
          onAddLandmark={onAddLandmark}
          onLandmarkAddComplete={onLandmarkAddComplete}
          overlayEnabled
          onOverlayAvailableChange={onOverlayAvailableChange}
          slice={slice}
          measureTool={measureTool}
          measureDraft={measureDraft}
          onMeasurePoint={onMeasurePoint}
          onMeasureFreehand={onMeasureFreehand}
          annotations={annotations}
          aiMeasurements={aiMeasurements}
          aiMeasurableCount={aiMeasurableCount}
          derivedMeasurements={derivedMeasurements}
          derivedMeasurableCount={derivedMeasurableCount}
          referenceLine={referenceLine}
          referenceLineReason={referenceLineReason}
          highlightedMeasurementId={highlightedMeasurementId}
          onSelectMeasurement={onSelectMeasurement}
          selectedMeasurementId={selectedMeasurementId}
          onMoveMeasurePoint={onMoveMeasurePoint}
          onMoveMaskPoint={onMoveMaskPoint}
          segmentation={segmentation}
          hiddenInstances={hiddenInstances}
          slicePixels={slicePixels}
          pixelsBaseUrl={pixelsBaseUrl}
        />
        {/*
          Leyenda por instancia: cada vértebra y cada disco con su color y su nivel.
          Es lo que permite ver a qué estructura pertenece cada mancha, y apagar una
          sin perder las demás.
        */}
        {segmentation && segmentation.instances.length > 0 && (
          <details className="rr-instances-panel">
            <summary>Estructuras ({segmentation.instances.length})</summary>
            <ul className="rr-instances" aria-label={`Estructuras segmentadas en ${plane}`}>
            {segmentation.instances.map((instance) => (
              <li key={instance.id}>
                <label>
                  <input
                    checked={!hiddenInstances.includes(instance.index)}
                    onChange={() => onToggleInstance(instance.index)}
                    type="checkbox"
                  />
                  <i style={{ background: resolveSegmentationDisplayColor(instance, segmentation) }} />
                  <span>{instanceLabel(instance, displayStructureLabel)}</span>
                </label>
              </li>
            ))}
            </ul>
          </details>
        )}
      </div>
      {slice && (
        <div className="rr-slicebar">
          <button className="rr-slice-step" type="button" onClick={() => slice.onStep(-1)} disabled={slice.current <= 0} aria-label={`Corte anterior en ${plane}`}>‹</button>
          <span className="rr-slice-track">
          <input
            className="rr-slice-range"
            type="range"
            min={0}
            max={slice.total - 1}
            value={slice.current}
            onChange={(event) => slice.onChange(Number(event.target.value))}
            aria-label={`Corte ${slice.current + 1} de ${slice.total} en ${seriesName}`}
          />
          {/*
            Marcadores de contenido: de un vistazo se ve dónde hay algo que mirar
            —el corte que analizó la IA y los cortes con anotaciones del revisor—
            en vez de tener que recorrer el stack entero para descubrirlo.
          */}
          <span className="rr-slice-marks" aria-hidden>
            {Array.from({ length: slice.total }, (_, index) => (
              <i
                className={`rr-slice-mark${index === slice.aiIndex ? " is-ai" : ""}${annotatedIndices?.has(index) ? " is-annotated" : ""}`}
                key={index}
                style={{ left: `${slice.total > 1 ? index / (slice.total - 1) * 100 : 0}%` }}
              />
            ))}
          </span>
          </span>
          <button className="rr-slice-step" type="button" onClick={() => slice.onStep(1)} disabled={slice.current >= slice.total - 1} aria-label={`Corte siguiente en ${plane}`}>›</button>
          <span className="rr-slice-index">{slice.current + 1}/{slice.total}</span>
          <button
            aria-pressed={cineOn}
            className={`rr-slice-cine${cineOn ? " is-on" : ""}`}
            disabled={slice.total < 2}
            onClick={() => setCineOn((value) => !value)}
            title={cineOn ? "Detener el recorrido automático" : "Recorrer la serie automáticamente"}
            type="button"
          >
            {cineOn ? "■" : "▶"} cine
          </button>
          <button
            className="rr-slice-ai"
            type="button"
            onClick={() => slice.onChange(slice.aiIndex)}
            disabled={slice.current === slice.aiIndex}
            title={`Volver al corte analizado por la IA (${slice.aiIndex + 1})`}
          >
            corte IA {slice.aiIndex + 1}
          </button>
        </div>
      )}
    </section>
  );
}
