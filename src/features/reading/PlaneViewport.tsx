import { MriSliceViewer, type MeasurementOverlay, type RawSlicePixels, type SliceNavigation } from "../../components/MriSliceViewer";
import { instanceColor, instanceLabel, type Segmentation } from "./segmentation";
import { displayStructureLabel } from "../../clinicalDisplay";
import type { SlicePixelsMeta } from "./pixels";
import type { MeasurementKind } from "./measurements";
import type { studyRunToMriViewerModel } from "../../viewModels/mriViewerViewModel";

export type PlaneViewportProps = {
  plane: "sagittal" | "axial";
  caseLabel: string;
  seriesName: string;
  model: ReturnType<typeof studyRunToMriViewerModel>;
  modelLabel: string;
  inferenceLabel: string;
  spacingLabel: string;
  slice?: SliceNavigation;
  active: boolean;
  onActivate: () => void;
  selectedLandmarkId: string;
  onSelectLandmark: (id: string) => void;
  readonly: boolean;
  addMode: boolean;
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
};

/**
 * Un plano de la sala de lectura: imagen, anotaciones de esquina y barra de stack.
 *
 * Se extrae para poder montar sagital y axial a la vez. Cada viewport mantiene su
 * propio corte porque los stacks son independientes: 17 cortes sagitales y 12
 * axiales no se recorren con el mismo índice.
 */
export function PlaneViewport({
  plane, caseLabel, seriesName, model, modelLabel, inferenceLabel, spacingLabel,
  slice, active, onActivate, selectedLandmarkId, onSelectLandmark, readonly, addMode,
  onMoveLandmark, onAddLandmark, onLandmarkAddComplete, onOverlayAvailableChange,
  measureTool, measureDraft, onMeasurePoint, onMeasureFreehand, annotations, aiMeasurements, aiMeasurableCount,
  derivedMeasurements, derivedMeasurableCount, referenceLine, referenceLineReason, onMoveMeasurePoint, annotatedIndices, onMoveMaskPoint,
  selectedMeasurementId, highlightedMeasurementId, onSelectMeasurement,
  segmentation, slicePixels, pixelsBaseUrl, hiddenInstances, onToggleInstance,
}: PlaneViewportProps) {
  const sliceLabel = slice ? `corte ${slice.current + 1}/${slice.total}` : "corte único";
  return (
    <section className={`rr-plane${active ? " is-active" : ""}`} onPointerDownCapture={onActivate}>
      <div className="rr-viewport">
        <div className="rr-corner rr-corner-tl"><strong>{caseLabel}</strong></div>
        <div className="rr-corner rr-corner-tr">
          <strong>{seriesName}</strong>
          {sliceLabel}
        </div>
        <div className="rr-corner rr-corner-bl">{modelLabel}{"\n"}{inferenceLabel}</div>
        <div className="rr-corner rr-corner-br">
          {spacingLabel}
          {"\n"}<span className="rr-disclaimer">No apto para diagnóstico clínico</span>
        </div>
        <MriSliceViewer
          model={model}
          selectedLandmarkId={selectedLandmarkId}
          onSelectLandmark={onSelectLandmark}
          readonly={readonly}
          addMode={addMode}
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
          <ul className="rr-instances" aria-label={`Estructuras segmentadas en ${plane}`}>
            {segmentation.instances.map((instance) => (
              <li key={instance.id}>
                <label>
                  <input
                    checked={!hiddenInstances.includes(instance.index)}
                    onChange={() => onToggleInstance(instance.index)}
                    type="checkbox"
                  />
                  <i style={{ background: instanceColor(instance.index) }} />
                  <span>{instanceLabel(instance, displayStructureLabel)}</span>
                </label>
              </li>
            ))}
          </ul>
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
