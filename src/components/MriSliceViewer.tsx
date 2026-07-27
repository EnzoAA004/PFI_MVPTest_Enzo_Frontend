import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { Plane, StudyLandmark, StudyMask, StudySeries } from "../appTypes";
import type { CanonicalAssetName, CanonicalPlaneAsset, CanonicalPlaneMask, CanonicalPlaneSeriesItem, CanonicalLandmark } from "../contracts/canonicalMultiplanarRun";
import { API_BASE_URL } from "../api";
import { useAuthenticatedImageUrl } from "../authenticatedAssets";
import { displayLandmarkLabel } from "../clinicalDisplay";
import { normalizeAiAssetUrl } from "../inferenceReadiness";
import { aiAssetUrl } from "../multiplanarApi";

/**
 * MriSliceViewer is shared by the canonical multiplanar flow
 * (AnalysisTimelineView, CanonicalPlaneSeriesItem/CanonicalPlaneMask/CanonicalLandmark)
 * and the legacy single-plane review workspace (StudyReviewView,
 * StudySeries/StudyMask/StudyLandmark). Props accept both shapes explicitly
 * instead of `any`; helper functions below narrow field-by-field since the
 * two shapes are not structurally identical.
 */
export type ViewerSeries = CanonicalPlaneSeriesItem | StudySeries;
export type ViewerMask = CanonicalPlaneMask | StudyMask;
export type ViewerLandmark = CanonicalLandmark | StudyLandmark;

type ViewerMode = "pan" | "window";
type WindowPreset = {
  id: string;
  label: string;
  brightness: number;
  contrast: number;
};
type Size = {
  width: number;
  height: number;
};

type Props = {
  variant: "sagittal" | "axial";
  planeRunId?: string;
  series?: ViewerSeries;
  masks?: ViewerMask[];
  assets?: CanonicalPlaneAsset[];
  landmarks?: ViewerLandmark[];
  maskVisibility?: Record<string, boolean>;
  sliceIndex?: number;
  overlayEnabled: boolean;
  overlayOpacity?: number;
  editMode: boolean;
  selectedMask?: string;
  selectedLandmark: string;
  onSelectMask: (mask: string) => void;
  onSelectLandmark: (landmark: string) => void;
  onSliceChange?: (slice: number) => void;
  onOverlayAvailableChange?: (available: boolean) => void;
  landmarkEditMode?: boolean;
  landmarkAddMode?: boolean;
  onLandmarkDraftChange?: (landmark: StudyLandmark, detail: string) => void;
  onLandmarkAddComplete?: () => void;
};

const neutralPreset: WindowPreset = { id: "neutral", label: "Neutral PNG", brightness: 100, contrast: 100 };
const customPreset: WindowPreset = { id: "custom", label: "Personalizado", brightness: 100, contrast: 100 };
export const initialLandmarksVisible = false;
export const initialOverlayOpacity = 0.65;
const windowPresets: WindowPreset[] = [
  neutralPreset,
  { id: "soft", label: "Tejido blando aprox.", brightness: 108, contrast: 118 },
  { id: "bone", label: "Hueso aprox.", brightness: 96, contrast: 138 },
  customPreset,
];

export function computeFitZoom(frame: Size, image: Size) {
  if (frame.width <= 0 || frame.height <= 0 || image.width <= 0 || image.height <= 0) return 1;
  return Math.min(frame.width / image.width, frame.height / image.height);
}

export function formatZoomPercent(zoom: number, fitZoom: number) {
  if (fitZoom <= 0) return "100%";
  return `${Math.round(zoom / fitZoom * 100)}%`;
}

export function neutralWindowLevel() {
  return { brightness: neutralPreset.brightness, contrast: neutralPreset.contrast, presetId: neutralPreset.id };
}

export function manualWindowLevel(brightness: number, contrast: number, dx: number, dy: number) {
  return {
    brightness: clamp(brightness - dy * 0.65, 45, 180),
    contrast: clamp(contrast + dx * 0.65, 45, 220),
    presetId: customPreset.id,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pointPercent(value: number) {
  return clamp(value, 0, 256) / 256 * 100;
}

function hasField<T extends string>(value: unknown, field: T): value is Record<T, unknown> {
  return typeof value === "object" && value !== null && field in value;
}

function stringField(value: unknown, field: string): string | undefined {
  return hasField(value, field) && typeof (value as Record<string, unknown>)[field] === "string" ? (value as Record<string, unknown>)[field] as string : undefined;
}

/** landmark.labelKey is canonical; landmark.label is the legacy StudyLandmark identifier. */
export function landmarkLabelKey(landmark: ViewerLandmark): string | undefined {
  return stringField(landmark, "labelKey") ?? stringField(landmark, "label");
}

function landmarkCoordinateSpace(landmark: ViewerLandmark): string | undefined {
  return stringField(landmark, "coordinateSpace");
}

function seriesCoordinateSpace(series: ViewerSeries | undefined): string | undefined {
  return stringField(series, "coordinateSpace");
}

function coordinateSpaceFrom(series: ViewerSeries | undefined, landmarks: ViewerLandmark[]) {
  return seriesCoordinateSpace(series) ?? landmarks.map(landmarkCoordinateSpace).find((value) => value !== undefined);
}

/** Stable selection/key identifier: landmark.id first, labelKey as controlled fallback, never the render-loop index. */
export function landmarkKeyOf(landmark: ViewerLandmark, index: number): string {
  return stringField(landmark, "id") ?? landmarkLabelKey(landmark) ?? `landmark-${index}`;
}

function safeAssetUrl(value: unknown) {
  return normalizeAiAssetUrl(value, API_BASE_URL);
}

function seriesAssetsMap(series: ViewerSeries | undefined): Partial<Record<CanonicalAssetName, string>> | undefined {
  return hasField(series, "assets") && typeof series.assets === "object" && series.assets ? series.assets as Partial<Record<CanonicalAssetName, string>> : undefined;
}

function findCanonicalAsset(assets: CanonicalPlaneAsset[] | undefined, assetName: CanonicalAssetName): string | undefined {
  return assets?.find((asset) => asset.assetName === assetName)?.url;
}

export function maskLabel(mask: ViewerMask): string {
  return stringField(mask, "label") ?? stringField(mask, "className") ?? stringField(mask, "role") ?? stringField(mask, "id") ?? "";
}

export function maskGroupName(mask: ViewerMask) {
  const raw = maskLabel(mask).toLowerCase();
  if (raw.includes("vertebra")) return "Grupo vertebral";
  if (raw.includes("canal")) return "Canal";
  if (raw.includes("disc")) return "Grupo discal";
  return maskLabel(mask) || "Clase";
}

function maskFallbackColor(group: string) {
  if (group === "Grupo vertebral") return "var(--mask-vertebral-body)";
  if (group === "Canal") return "var(--mask-spinal-canal)";
  if (group === "Grupo discal") return "var(--mask-disc)";
  return "var(--mask-foramen-other-soft-tissue)";
}

function assetStorageMessage(status?: string, hasUrl?: boolean) {
  if (status === "stored") return "Recurso persistido disponible.";
  if (status === "upstream_only") return "Recurso temporal disponible desde AI Module.";
  if (status === "missing") return "El recurso derivado ya no se encuentra disponible.";
  if (status === "rejected") return "El recurso fue rechazado durante la persistencia.";
  if (status === "unavailable") return "No existe un recurso visual para esta corrida.";
  return hasUrl ? "Recurso visual declarado por backend." : "No existe un recurso visual para esta corrida.";
}

export function MriSliceViewer({
  variant,
  planeRunId,
  series,
  masks = [],
  assets,
  landmarks = [],
  overlayEnabled,
  overlayOpacity = initialOverlayOpacity,
  landmarkEditMode = false,
  landmarkAddMode = false,
  selectedLandmark,
  onSelectLandmark,
  onOverlayAvailableChange,
  onLandmarkDraftChange,
  onLandmarkAddComplete,
}: Props) {
  const plane = variant as Plane;
  const seriesAssets = seriesAssetsMap(series);
  const declaredUnavailable = hasField(series, "available") && series.available === false
    || ["missing", "rejected", "unavailable"].includes(stringField(series, "storageStatus") ?? "");
  const inputUrl = safeAssetUrl((series as { imageUrl?: unknown } | undefined)?.imageUrl)
    ?? safeAssetUrl(seriesAssets?.["input.png"])
    ?? safeAssetUrl(findCanonicalAsset(assets, "input.png"))
    ?? (!declaredUnavailable && planeRunId ? aiAssetUrl(planeRunId, plane, "input.png") : undefined);
  const overlayUrl = safeAssetUrl((series as { overlayUrl?: unknown } | undefined)?.overlayUrl)
    ?? safeAssetUrl(seriesAssets?.["overlay.png"])
    ?? safeAssetUrl(findCanonicalAsset(assets, "overlay.png"))
    ?? (!declaredUnavailable && planeRunId ? aiAssetUrl(planeRunId, plane, "overlay.png") : undefined);
  const inputAsset = useAuthenticatedImageUrl(inputUrl);
  const overlayAsset = useAuthenticatedImageUrl(overlayUrl);
  const inputState = inputAsset.state;
  const overlayState = overlayAsset.state;
  const [mode, setMode] = useState<ViewerMode>("pan");
  const [selectedPresetId, setSelectedPresetId] = useState(neutralPreset.id);
  const [brightness, setBrightness] = useState(neutralPreset.brightness);
  const [contrast, setContrast] = useState(neutralPreset.contrast);
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [frameSize, setFrameSize] = useState<Size>({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });
  const [fitInitialized, setFitInitialized] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(overlayEnabled);
  const [overlayAlpha, setOverlayAlpha] = useState(overlayOpacity);
  const [landmarksVisible, setLandmarksVisible] = useState(initialLandmarksVisible);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; brightness: number; contrast: number; panX: number; panY: number } | null>(null);
  const landmarkDragRef = useRef<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const coordinateSpace = coordinateSpaceFrom(series, landmarks);
  const realLandmarks = useMemo(
    () => landmarks.filter((landmark): landmark is ViewerLandmark & { x: number; y: number } => Number.isFinite(landmark.x) && Number.isFinite(landmark.y)),
    [landmarks],
  );
  const landmarkEntries = useMemo(
    () => realLandmarks.map((landmark, index) => ({ landmark, key: landmarkKeyOf(landmark, index) })),
    [realLandmarks],
  );
  const maskGroups = useMemo(() => {
    const groups = new Map<string, { id: string; label: string; color: string; technicalName: string }>();
    masks.forEach((mask, index) => {
      const label = maskGroupName(mask);
      if (!groups.has(label)) {
        groups.set(label, {
          id: stringField(mask, "id") ?? stringField(mask, "className") ?? `${label}-${index}`,
          label,
          color: stringField(mask, "color") ?? maskFallbackColor(label),
          technicalName: stringField(mask, "className") ?? stringField(mask, "role") ?? maskLabel(mask) ?? label,
        });
      }
    });
    return Array.from(groups.values());
  }, [masks]);
  const imageLoaded = inputState === "loaded";
  const overlayLoaded = overlayState === "loaded";
  const storageMessage = assetStorageMessage(stringField(series, "storageStatus"), Boolean(inputUrl));
  const canEditLandmarks = Boolean(imageLoaded && coordinateSpace && onLandmarkDraftChange);
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const filter = `brightness(${brightness}%) contrast(${contrast}%)`;
  const seriesName = stringField(series, "name") ?? (variant === "sagittal" ? "Sagital" : "Axial");
  const seriesId = stringField(series, "id") ?? `${plane}-asset`;
  const seriesSelectedSlice = hasField(series, "selectedSlice") && typeof series.selectedSlice === "number" ? series.selectedSlice : 1;

  useEffect(() => {
    setOverlayVisible(overlayEnabled);
  }, [overlayEnabled]);

  useEffect(() => {
    onOverlayAvailableChange?.(overlayLoaded);
  }, [onOverlayAvailableChange, overlayLoaded]);

  useEffect(() => {
    setFitInitialized(false);
    setImageSize({ width: 0, height: 0 });
    setPan({ x: 0, y: 0 });
  }, [inputUrl]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const updateSize = () => setFrameSize({ width: frame.clientWidth, height: frame.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!imageLoaded || imageSize.width <= 0 || frameSize.width <= 0) return;
    const nextFit = computeFitZoom(frameSize, imageSize);
    setFitZoom(nextFit);
    if (!fitInitialized) {
      setZoom(nextFit);
      setPan({ x: 0, y: 0 });
      setFitInitialized(true);
    }
  }, [fitInitialized, frameSize, imageLoaded, imageSize]);

  function applyFit() {
    const nextFit = computeFitZoom(frameSize, imageSize);
    setFitZoom(nextFit);
    setZoom(nextFit);
    setPan({ x: 0, y: 0 });
    setFitInitialized(true);
  }

  function applyPreset(preset: WindowPreset) {
    if (preset.id === "custom") return;
    setSelectedPresetId(preset.id);
    setBrightness(preset.brightness);
    setContrast(preset.contrast);
  }

  function resetWindowLevel() {
    applyPreset(neutralPreset);
  }

  function resetView() {
    applyFit();
  }

  function boundedZoom(nextZoom: number) {
    const minZoom = Math.max(fitZoom * 0.3, 0.05);
    return clamp(Number(nextZoom.toFixed(3)), minZoom, fitZoom * 6);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!imageLoaded) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.08 : 0.08;
    setZoom((value) => boundedZoom(value + fitZoom * direction));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageLoaded || event.button !== 0) return;
    if (landmarkAddMode) {
      createLandmarkDraft(event);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      brightness,
      contrast,
      panX: pan.x,
      panY: pan.y,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (landmarkDragRef.current && canEditLandmarks) {
      const point = pointFromEvent(event);
      const entry = landmarkEntries.find((item) => item.key === landmarkDragRef.current);
      if (point && entry) {
        const { landmark, key } = entry;
        onLandmarkDraftChange?.(
          { id: key, label: landmarkLabelKey(landmark) ?? key, seriesId, sliceIndex: seriesSelectedSlice, x: point.x, y: point.y, editable: true },
          `Landmark ${displayLandmarkLabel(landmarkLabelKey(landmark))} movido por revisor en ${coordinateSpace}`,
        );
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (mode === "window") {
      setSelectedPresetId(customPreset.id);
      setContrast(clamp(drag.contrast + dx * 0.65, 45, 220));
      setBrightness(clamp(drag.brightness - dy * 0.65, 45, 180));
      return;
    }
    setPan({ x: drag.panX + dx, y: drag.panY + dy });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    landmarkDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  }

  function pointFromEvent(event: { clientX: number; clientY: number }) {
    const image = imageRef.current;
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width * 256, 0, 256),
      y: clamp((event.clientY - rect.top) / rect.height * 256, 0, 256),
    };
  }

  function createLandmarkDraft(event: { clientX: number; clientY: number }) {
    if (!landmarkAddMode || !canEditLandmarks) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const landmark: StudyLandmark = {
      id: `reviewer-landmark-${Date.now()}`,
      label: `R${realLandmarks.length + 1}`,
      seriesId,
      sliceIndex: seriesSelectedSlice,
      x: point.x,
      y: point.y,
      editable: true,
    };
    onLandmarkDraftChange?.(landmark, `Landmark ${landmark.label} agregado por revisor en ${coordinateSpace}`);
    onSelectLandmark(landmark.id);
    onLandmarkAddComplete?.();
  }

  return (
    <div className={`mri-viewer real-asset-viewer ${variant}`}>
      <div className="viewer-caption">
        <div>
          <strong>{seriesName}</strong>
          <span>{imageLoaded ? storageMessage : inputState === "failed" ? storageMessage : "Verificando recurso real"}</span>
        </div>
        <div className="dicom-meta">
          <em>PNG servido único</em>
          <em>W/L aprox. {Math.round(contrast)} / {Math.round(brightness)}</em>
          <em>Zoom {formatZoomPercent(zoom, fitZoom)}</em>
          {coordinateSpace && <em>{coordinateSpace}</em>}
        </div>
      </div>

      <div className="viewer-controls professional-viewer-controls" role="toolbar" aria-label="Controles del visor 2D">
        <label className="control-field">
          <span>Ventana/Nivel</span>
          <select aria-label="Preset de ventana y nivel" onChange={(event) => {
            const preset = windowPresets.find((item) => item.id === event.target.value);
            if (preset) applyPreset(preset);
          }} value={selectedPresetId}>
            {windowPresets.map((preset) => <option disabled={preset.id === "custom"} key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
        </label>
        <button className={mode === "window" ? "active" : ""} disabled={!imageLoaded} onClick={() => setMode("window")} type="button">Arrastrar W/L</button>
        <button className={mode === "pan" ? "active" : ""} disabled={!imageLoaded} onClick={() => setMode("pan")} type="button">Desplazar</button>
        <button disabled={!imageLoaded} onClick={() => setZoom((value) => boundedZoom(value - fitZoom * 0.2))} type="button">Alejar</button>
        <span className="zoom-readout">{formatZoomPercent(zoom, fitZoom)}</span>
        <button disabled={!imageLoaded} onClick={() => setZoom((value) => boundedZoom(value + fitZoom * 0.2))} type="button">Acercar</button>
        <button disabled={!imageLoaded} onClick={applyFit} type="button">Ajustar</button>
        <button disabled={!imageLoaded} onClick={resetView} type="button">Restablecer vista</button>
        <button disabled={!imageLoaded} onClick={resetWindowLevel} type="button">Restablecer W/L</button>
      </div>

      <div className="plane-controls-panel">
        <label className="toggle-row">
          <input checked={overlayVisible} disabled={!overlayLoaded} onChange={(event) => setOverlayVisible(event.target.checked)} type="checkbox" />
          <span>Mostrar segmentación</span>
        </label>
        <label className="opacity-control">
          <span>Opacidad {Math.round(overlayAlpha * 100)}%</span>
          <input aria-label="Opacidad de segmentación" disabled={!overlayLoaded} max="1" min="0" onChange={(event) => setOverlayAlpha(Number(event.target.value))} step="0.01" type="range" value={overlayAlpha} />
        </label>
        <label className="toggle-row">
          <input checked={landmarksVisible} onChange={(event) => setLandmarksVisible(event.target.checked)} type="checkbox" />
          <span>Mostrar puntos de referencia</span>
        </label>
      </div>

      <div className="segmentation-legend-panel">
        <strong>Leyenda de segmentación</strong>
        <div className="segmentation-legend-list">
          {maskGroups.length ? maskGroups.map((group) => (
            <label className="segmentation-class-control" key={group.id} title={`Control por clase pendiente de assets separados. Clase tecnica: ${group.technicalName}`}>
              <input checked disabled type="checkbox" />
              <span className="mask-swatch" style={{ background: group.color }} />
              <span>{group.label}</span>
            </label>
          )) : <span className="muted">Máscara por clase no informada.</span>}
        </div>
        <p className="viewer-limit-note">El overlay actual es compuesto. Ocultar clases individuales requiere assets separados por clase; por ahora el switch global de segmentación es el control funcional.</p>
      </div>

      <p className="viewer-limit-note">W/L es un filtro aproximado de brillo/contraste sobre un PNG de 8 bits. El ventaneo DICOM y la navegacion multicorte requieren AI-009.</p>

      <div
        className={`real-slice-frame ${mode === "window" ? "window-mode" : "pan-mode"} ${landmarkAddMode ? "landmark-add-mode" : ""}`}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        ref={frameRef}
      >
        {inputState === "loaded" && inputAsset.url ? (
          <div className="asset-transform" style={{ height: `${imageSize.height}px`, transform, width: `${imageSize.width}px` }}>
            <img
              ref={imageRef}
              alt={`${seriesName} recurso de entrada`}
              className="mri-asset-img"
              draggable={false}
              onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              src={inputAsset.url}
              style={{ filter }}
            />
            {overlayVisible && overlayLoaded && overlayAsset.url && (
              <img alt={`${seriesName} recurso de superposicion IA`} className="mri-overlay-img" draggable={false} src={overlayAsset.url} style={{ opacity: overlayAlpha, transform: "translateZ(0)" }} />
            )}
            {landmarksVisible && landmarkEntries.map(({ landmark, key }) => {
              const displayLabel = displayLandmarkLabel(landmarkLabelKey(landmark));
              const selected = selectedLandmark === key;
              return (
                <button
                  aria-label={`Punto de referencia ${displayLabel}`}
                  className={`asset-landmark ${selected ? "selected" : ""}`}
                  key={key}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectLandmark(key);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectLandmark(key);
                    if (!landmarkEditMode || !canEditLandmarks || event.button !== 0) return;
                    landmarkDragRef.current = key;
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  style={{ left: `${pointPercent(landmark.x)}%`, top: `${pointPercent(landmark.y)}%` }}
                  title={displayLabel}
                  type="button"
                >
                  {selected && <span>{displayLabel}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="asset-empty-state">
            <strong>{inputState === "failed" ? "Imagen no disponible desde backend" : "Verificando input.png real"}</strong>
            <span>{storageMessage} No se renderiza una resonancia simulada. El visor espera el recurso real `input.png` de la corrida de plano.</span>
          </div>
        )}
      </div>

      <div className="viewer-footer real-viewer-footer">
        <span>{overlayLoaded ? "overlay.png disponible" : overlayState === "failed" ? "overlay.png no disponible" : "superposición pendiente"}</span>
        <span>{overlayVisible && overlayLoaded ? `${Math.round(overlayAlpha * 100)}% opacidad` : "Segmentación IA deshabilitada si falta el recurso"}</span>
        <span>{landmarksVisible ? `${realLandmarks.length} puntos visibles` : "Puntos de referencia ocultos"}</span>
        <span>{landmarkEditMode && canEditLandmarks ? "Edicion de landmarks del revisor" : "Corte unico servido"}</span>
      </div>
      {overlayState === "failed" && <div className="panel-hidden-placeholder">overlay.png no disponible desde backend. Se muestra input.png sin superposición simulada.</div>}
      {!coordinateSpace && <div className="panel-hidden-placeholder">Espacio de coordenadas no informado por backend; mover/agregar landmarks queda deshabilitado para no inventar model_256/original.</div>}
      {coordinateSpace && landmarkEditMode && <div className="panel-hidden-placeholder">Correcciones de landmarks en borrador local no persistido. Pendiente BE-008/FE-010 + AI-011.</div>}
    </div>
  );
}
