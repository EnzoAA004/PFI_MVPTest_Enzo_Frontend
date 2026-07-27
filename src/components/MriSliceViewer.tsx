import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useAuthenticatedImageUrl } from "../authenticatedAssets";
import { displayLandmarkLabel } from "../clinicalDisplay";
import type { MriViewerMask, MriViewerModel } from "../viewModels/mriViewerViewModel";

/**
 * Pure presentation component. Knows nothing about either source domain
 * (multiplanar canonical plane runs or the legacy single-plane study
 * pipeline) — only MriViewerModel (src/viewModels/mriViewerViewModel.ts).
 * Domain adapters (canonicalPlaneToMriViewerModel / studyRunToMriViewerModel)
 * are responsible for producing that model, including resolving and
 * sanitizing asset URLs.
 */

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
type Point = {
  x: number;
  y: number;
};

type Props = {
  model: MriViewerModel;
  selectedLandmarkId: string;
  onSelectLandmark: (landmarkId: string) => void;
  onMoveLandmark?: (landmarkId: string, point: Point) => void;
  onAddLandmark?: (point: Point) => void;
  onLandmarkAddComplete?: () => void;
  readonly?: boolean;
  addMode?: boolean;
  overlayEnabled?: boolean;
  overlayOpacity?: number;
  onOverlayAvailableChange?: (available: boolean) => void;
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

function maskFallbackColor(group: string | undefined) {
  if (group === "Grupo vertebral") return "var(--mask-vertebral-body)";
  if (group === "Canal") return "var(--mask-spinal-canal)";
  if (group === "Grupo discal") return "var(--mask-disc)";
  return "var(--mask-foramen-other-soft-tissue)";
}

export function maskGroups(masks: MriViewerMask[]) {
  const groups = new Map<string, { id: string; label: string; color: string; technicalName: string }>();
  masks.forEach((mask) => {
    const label = mask.groupName ?? mask.labelKey;
    if (!groups.has(label)) {
      groups.set(label, {
        id: mask.id,
        label,
        color: mask.color ?? maskFallbackColor(mask.groupName),
        technicalName: mask.labelKey,
      });
    }
  });
  return Array.from(groups.values());
}

function assetStorageMessage(hasUrl: boolean) {
  return hasUrl ? "Recurso visual declarado por backend." : "No existe un recurso visual para esta corrida.";
}

export function MriSliceViewer({
  model,
  selectedLandmarkId,
  onSelectLandmark,
  onMoveLandmark,
  onAddLandmark,
  onLandmarkAddComplete,
  readonly = true,
  addMode = false,
  overlayEnabled = true,
  overlayOpacity = initialOverlayOpacity,
  onOverlayAvailableChange,
}: Props) {
  const inputUrl = model.assets.find((asset) => asset.assetName === "input.png")?.url;
  const overlayUrl = model.assets.find((asset) => asset.assetName === "overlay.png")?.url;
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
  const landmarks = model.landmarks;
  const groups = useMemo(() => maskGroups(model.masks), [model.masks]);
  const imageLoaded = inputState === "loaded";
  const overlayLoaded = overlayState === "loaded";
  const storageMessage = assetStorageMessage(Boolean(inputUrl));
  const canEditLandmarks = Boolean(imageLoaded && model.coordinateSpace && !readonly);
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const filter = `brightness(${brightness}%) contrast(${contrast}%)`;
  const seriesName = model.plane === "sagittal" ? "Sagital" : "Axial";

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
    if (addMode) {
      createLandmark(event);
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
      if (point) onMoveLandmark?.(landmarkDragRef.current, point);
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

  function pointFromEvent(event: { clientX: number; clientY: number }): Point | null {
    const image = imageRef.current;
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width * 256, 0, 256),
      y: clamp((event.clientY - rect.top) / rect.height * 256, 0, 256),
    };
  }

  function createLandmark(event: { clientX: number; clientY: number }) {
    if (!addMode || !canEditLandmarks) return;
    const point = pointFromEvent(event);
    if (!point) return;
    onAddLandmark?.(point);
    onLandmarkAddComplete?.();
  }

  return (
    <div className={`mri-viewer real-asset-viewer ${model.plane}`}>
      <div className="viewer-caption">
        <div>
          <strong>{seriesName}</strong>
          <span>{imageLoaded ? storageMessage : inputState === "failed" ? storageMessage : "Verificando recurso real"}</span>
        </div>
        <div className="dicom-meta">
          <em>PNG servido único</em>
          <em>W/L aprox. {Math.round(contrast)} / {Math.round(brightness)}</em>
          <em>Zoom {formatZoomPercent(zoom, fitZoom)}</em>
          {model.coordinateSpace && <em>{model.coordinateSpace}</em>}
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
          {groups.length ? groups.map((group) => (
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
        className={`real-slice-frame ${mode === "window" ? "window-mode" : "pan-mode"} ${addMode ? "landmark-add-mode" : ""}`}
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
            {landmarksVisible && landmarks.map((landmark) => {
              const displayLabel = displayLandmarkLabel(landmark.labelKey);
              const selected = selectedLandmarkId === landmark.id;
              return (
                <button
                  aria-label={`Punto de referencia ${displayLabel}`}
                  className={`asset-landmark ${selected ? "selected" : ""}`}
                  key={landmark.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectLandmark(landmark.id);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectLandmark(landmark.id);
                    if (!canEditLandmarks || event.button !== 0) return;
                    landmarkDragRef.current = landmark.id;
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
        <span>{landmarksVisible ? `${landmarks.length} puntos visibles` : "Puntos de referencia ocultos"}</span>
        <span>{!readonly && canEditLandmarks ? "Edicion de landmarks del revisor" : "Corte unico servido"}</span>
      </div>
      {overlayState === "failed" && <div className="panel-hidden-placeholder">overlay.png no disponible desde backend. Se muestra input.png sin superposición simulada.</div>}
      {!model.coordinateSpace && <div className="panel-hidden-placeholder">Espacio de coordenadas no informado por backend; mover/agregar landmarks queda deshabilitado para no inventar model_256/original.</div>}
      {model.coordinateSpace && !readonly && <div className="panel-hidden-placeholder">Correcciones de landmarks en borrador local no persistido. Pendiente BE-008/FE-010 + AI-011.</div>}
    </div>
  );
}
