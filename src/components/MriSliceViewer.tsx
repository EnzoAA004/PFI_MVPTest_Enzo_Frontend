import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { Plane, StudyLandmark } from "../appTypes";
import type { PlaneAssetRefs } from "../multiplanarRunTypes";
import { API_BASE_URL } from "../api";
import { useAuthenticatedImageUrl } from "../authenticatedAssets";
import { normalizeAiAssetUrl } from "../inferenceReadiness";
import { aiAssetUrl } from "../multiplanarApi";

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
  runId?: string;
  series?: any;
  masks?: any[];
  landmarks?: StudyLandmark[];
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

function coordinateSpaceFrom(series?: any, landmarks?: StudyLandmark[]) {
  const fromSeries = typeof series?.coordinateSpace === "string" ? series.coordinateSpace : undefined;
  const fromLandmark = landmarks?.find((landmark: any) => typeof landmark.coordinateSpace === "string") as any;
  return fromSeries ?? fromLandmark?.coordinateSpace;
}

function safeAssetUrl(value: unknown) {
  return normalizeAiAssetUrl(value, API_BASE_URL);
}

function assetRefsFrom(series?: any): PlaneAssetRefs | undefined {
  return series?.assets && typeof series.assets === "object" ? series.assets as PlaneAssetRefs : undefined;
}

function maskGroupName(mask: any) {
  const raw = String(mask?.label ?? mask?.classLabel ?? mask?.className ?? mask?.id ?? "").toLowerCase();
  if (raw.includes("vertebra")) return "Grupo vertebral";
  if (raw.includes("canal")) return "Canal";
  if (raw.includes("disc")) return "Grupo discal";
  return String(mask?.label ?? mask?.classLabel ?? mask?.className ?? "Clase");
}

function maskFallbackColor(group: string) {
  if (group === "Grupo vertebral") return "var(--mask-vertebral-body)";
  if (group === "Canal") return "var(--mask-spinal-canal)";
  if (group === "Grupo discal") return "var(--mask-disc)";
  return "var(--mask-foramen-other-soft-tissue)";
}

export function MriSliceViewer({
  variant,
  runId,
  series,
  masks = [],
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
  const assets = assetRefsFrom(series);
  const inputUrl = safeAssetUrl(series?.imageUrl) ?? safeAssetUrl(assets?.["input.png"]) ?? (runId ? aiAssetUrl(runId, plane, "input.png") : undefined);
  const overlayUrl = safeAssetUrl(series?.overlayUrl) ?? safeAssetUrl(assets?.["overlay.png"]) ?? (runId ? aiAssetUrl(runId, plane, "overlay.png") : undefined);
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
  const realLandmarks = useMemo(() => landmarks.filter((landmark) => Number.isFinite(landmark.x) && Number.isFinite(landmark.y)), [landmarks]);
  const maskGroups = useMemo(() => {
    const groups = new Map<string, { id: string; label: string; color: string; technicalName: string }>();
    masks.forEach((mask, index) => {
      const label = maskGroupName(mask);
      if (!groups.has(label)) {
        groups.set(label, {
          id: String(mask?.id ?? mask?.className ?? `${label}-${index}`),
          label,
          color: typeof mask?.color === "string" ? mask.color : maskFallbackColor(label),
          technicalName: String(mask?.className ?? mask?.classLabel ?? mask?.label ?? label),
        });
      }
    });
    return Array.from(groups.values());
  }, [masks]);
  const imageLoaded = inputState === "loaded";
  const overlayLoaded = overlayState === "loaded";
  const canEditLandmarks = Boolean(imageLoaded && coordinateSpace && onLandmarkDraftChange);
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const filter = `brightness(${brightness}%) contrast(${contrast}%)`;

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
      const landmark = realLandmarks.find((item) => item.id === landmarkDragRef.current);
      if (point && landmark) {
        onLandmarkDraftChange?.(
          { ...landmark, x: point.x, y: point.y, editable: true },
          `Landmark ${landmark.label} movido por revisor en ${coordinateSpace}`,
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
      seriesId: String(series?.id ?? `${plane}-asset`),
      sliceIndex: Number(series?.selectedSlice ?? 1),
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
          <strong>{series?.name ?? (variant === "sagittal" ? "Sagital T2" : "Axial T2")}</strong>
          <span>{imageLoaded ? "Recurso real del backend" : inputState === "failed" ? "Imagen no disponible desde backend" : "Verificando recurso real"}</span>
        </div>
        <div className="dicom-meta">
          <em>PNG servido unico</em>
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
          <span>Mostrar segmentacion</span>
        </label>
        <label className="opacity-control">
          <span>Opacidad {Math.round(overlayAlpha * 100)}%</span>
          <input aria-label="Opacidad de segmentacion" disabled={!overlayLoaded} max="1" min="0" onChange={(event) => setOverlayAlpha(Number(event.target.value))} step="0.01" type="range" value={overlayAlpha} />
        </label>
        <label className="toggle-row">
          <input checked={landmarksVisible} onChange={(event) => setLandmarksVisible(event.target.checked)} type="checkbox" />
          <span>Mostrar puntos de referencia</span>
        </label>
      </div>

      <div className="segmentation-legend-panel">
        <strong>Leyenda de segmentacion</strong>
        <div className="segmentation-legend-list">
          {maskGroups.length ? maskGroups.map((group) => (
            <label className="segmentation-class-control" key={group.id} title={`Control por clase pendiente de assets separados. Clase tecnica: ${group.technicalName}`}>
              <input checked disabled type="checkbox" />
              <span className="mask-swatch" style={{ background: group.color }} />
              <span>{group.label}</span>
            </label>
          )) : <span className="muted">Mascara por clase no informada.</span>}
        </div>
        <p className="viewer-limit-note">El overlay actual es compuesto. Ocultar clases individuales requiere assets separados por clase; por ahora el switch global de segmentacion es el control funcional.</p>
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
              alt={`${series?.name ?? variant} recurso de entrada`}
              className="mri-asset-img"
              draggable={false}
              onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              src={inputAsset.url}
              style={{ filter }}
            />
            {overlayVisible && overlayLoaded && overlayAsset.url && (
              <img alt={`${series?.name ?? variant} recurso de superposicion IA`} className="mri-overlay-img" draggable={false} src={overlayAsset.url} style={{ opacity: overlayAlpha, transform: "translateZ(0)" }} />
            )}
            {landmarksVisible && realLandmarks.map((landmark) => (
              <button
                aria-label={`Punto de referencia ${landmark.label}`}
                className={`asset-landmark ${selectedLandmark === landmark.id || selectedLandmark === landmark.label ? "selected" : ""}`}
                key={landmark.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectLandmark(landmark.id);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectLandmark(landmark.id);
                  if (!landmarkEditMode || !canEditLandmarks || event.button !== 0) return;
                  landmarkDragRef.current = landmark.id;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                style={{ left: `${pointPercent(landmark.x)}%`, top: `${pointPercent(landmark.y)}%` }}
                title={landmark.label}
                type="button"
              >
                {(selectedLandmark === landmark.id || selectedLandmark === landmark.label) && <span>{landmark.label}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="asset-empty-state">
            <strong>{inputState === "failed" ? "Imagen no disponible desde backend" : "Verificando input.png real"}</strong>
            <span>No se renderiza una resonancia simulada. El visor espera el recurso real `input.png` de la corrida.</span>
          </div>
        )}
      </div>

      <div className="viewer-footer real-viewer-footer">
        <span>{overlayLoaded ? "overlay.png disponible" : overlayState === "failed" ? "overlay.png no disponible" : "superposicion pendiente"}</span>
        <span>{overlayVisible && overlayLoaded ? `${Math.round(overlayAlpha * 100)}% opacidad` : "Segmentacion IA deshabilitada si falta el recurso"}</span>
        <span>{landmarksVisible ? `${realLandmarks.length} puntos visibles` : "Puntos de referencia ocultos"}</span>
        <span>{landmarkEditMode && canEditLandmarks ? "Edicion de landmarks del revisor" : "Corte unico servido"}</span>
      </div>
      {overlayState === "failed" && <div className="panel-hidden-placeholder">overlay.png no disponible desde backend. Se muestra input.png sin superposicion simulada.</div>}
      {!coordinateSpace && <div className="panel-hidden-placeholder">Espacio de coordenadas no informado por backend; mover/agregar landmarks queda deshabilitado para no inventar model_256/original.</div>}
      {coordinateSpace && landmarkEditMode && <div className="panel-hidden-placeholder">Correcciones de landmarks en borrador local no persistido. Pendiente BE-008/FE-010 + AI-011.</div>}
    </div>
  );
}
