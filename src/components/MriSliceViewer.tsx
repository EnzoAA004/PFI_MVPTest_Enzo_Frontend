import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { Plane, StudyLandmark } from "../appTypes";
import { aiAssetUrl } from "../multiplanarApi";

type ViewerMode = "pan" | "window";
type AssetState = "idle" | "loading" | "loaded" | "failed";
type WindowPreset = {
  id: string;
  label: string;
  brightness: number;
  contrast: number;
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

const windowPresets: WindowPreset[] = [
  { id: "neutral", label: "Neutral PNG", brightness: 100, contrast: 100 },
  { id: "soft", label: "Soft tissue approx.", brightness: 108, contrast: 118 },
  { id: "bone", label: "Bone approx.", brightness: 96, contrast: 138 },
];

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

function useAssetState(url: string | undefined, disabled = false) {
  const [state, setState] = useState<AssetState>(disabled || !url ? "idle" : "loading");

  useEffect(() => {
    if (disabled || !url) {
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    const timeout = window.setTimeout(() => {
      if (!cancelled) setState("failed");
    }, 2500);
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        window.clearTimeout(timeout);
        setState("loaded");
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        window.clearTimeout(timeout);
        setState("failed");
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
    };
  }, [disabled, url]);

  return state;
}

export function MriSliceViewer({
  variant,
  runId,
  series,
  landmarks = [],
  overlayEnabled,
  overlayOpacity = 0.74,
  landmarkEditMode = false,
  landmarkAddMode = false,
  selectedLandmark,
  onSelectLandmark,
  onOverlayAvailableChange,
  onLandmarkDraftChange,
  onLandmarkAddComplete,
}: Props) {
  const plane = variant as Plane;
  const inputUrl = series?.imageUrl ?? (runId ? aiAssetUrl(runId, plane, "input.png") : undefined);
  const overlayUrl = series?.overlayUrl ?? (runId ? aiAssetUrl(runId, plane, "overlay.png") : undefined);
  const inputState = useAssetState(inputUrl);
  const overlayState = useAssetState(overlayUrl, inputState !== "loaded");
  const [mode, setMode] = useState<ViewerMode>("pan");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; brightness: number; contrast: number; panX: number; panY: number } | null>(null);
  const landmarkDragRef = useRef<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const coordinateSpace = coordinateSpaceFrom(series, landmarks);
  const realLandmarks = useMemo(() => landmarks.filter((landmark) => Number.isFinite(landmark.x) && Number.isFinite(landmark.y)), [landmarks]);
  const imageLoaded = inputState === "loaded";
  const overlayLoaded = overlayState === "loaded";
  const canEditLandmarks = Boolean(imageLoaded && coordinateSpace && onLandmarkDraftChange);
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const filter = `brightness(${brightness}%) contrast(${contrast}%)`;

  useEffect(() => {
    onOverlayAvailableChange?.(overlayLoaded);
  }, [onOverlayAvailableChange, overlayLoaded]);

  function applyPreset(preset: WindowPreset) {
    setBrightness(preset.brightness);
    setContrast(preset.contrast);
  }

  function fitImage() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!imageLoaded) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.08 : 0.08;
    setZoom((value) => clamp(Number((value + direction).toFixed(2)), 0.5, 4));
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
          <strong>{series?.name ?? (variant === "sagittal" ? "Recurso sagital" : "Recurso axial")}</strong>
          <span>{imageLoaded ? "Recurso real del backend" : inputState === "failed" ? "Imagen no disponible desde backend" : "Verificándo recurso real"}</span>
        </div>
        <div className="dicom-meta">
          <em>Single served PNG</em>
          <em>W/L approx. {Math.round(contrast)} / {Math.round(brightness)}</em>
          {coordinateSpace && <em>{coordinateSpace}</em>}
        </div>
      </div>

      <div className="viewer-controls" role="toolbar" aria-label="Controles del visor 2D">
        <select aria-label="Preset de ventana y nivel" onChange={(event) => {
          const preset = windowPresets.find((item) => item.id === event.target.value);
          if (preset) applyPreset(preset);
        }} defaultValue="neutral">
          {windowPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
        <button className={mode === "window" ? "active" : ""} disabled={!imageLoaded} onClick={() => setMode("window")} type="button">Arrastrar W/L</button>
        <button className={mode === "pan" ? "active" : ""} disabled={!imageLoaded} onClick={() => setMode("pan")} type="button">Desplazar</button>
        <button disabled={!imageLoaded} onClick={() => setZoom((value) => clamp(Number((value - 0.2).toFixed(2)), 0.5, 4))} type="button">-</button>
        <span className="zoom-readout">{Math.round(zoom * 100)}%</span>
        <button disabled={!imageLoaded} onClick={() => setZoom((value) => clamp(Number((value + 0.2).toFixed(2)), 0.5, 4))} type="button">+</button>
        <button disabled={!imageLoaded} onClick={fitImage} type="button">Ajustar</button>
      </div>

      <p className="viewer-limit-note">W/L es un filtro aproximado de brillo/contraste sobre un PNG de 8 bits. El ventaneo DICOM y la navegación multicorte requieren AI-009.</p>

      <div
        className={`real-slice-frame ${mode === "window" ? "window-mode" : "pan-mode"} ${landmarkAddMode ? "landmark-add-mode" : ""}`}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        {inputState === "loaded" && inputUrl ? (
          <div className="asset-transform" style={{ transform }}>
            <img ref={imageRef} alt={`${series?.name ?? variant} recurso de entrada`} className="mri-asset-img" draggable={false} src={inputUrl} style={{ filter }} />
            {overlayEnabled && overlayLoaded && overlayUrl && (
              <img alt={`${series?.name ?? variant} recurso de superposición IA`} className="mri-overlay-img" draggable={false} src={overlayUrl} style={{ opacity: overlayOpacity, transform: "translateZ(0)" }} />
            )}
            {realLandmarks.map((landmark) => (
              <button
                aria-label={`Landmark ${landmark.label}`}
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
                type="button"
              >
                {landmark.label.slice(0, 4)}
              </button>
            ))}
          </div>
        ) : (
          <div className="asset-empty-state">
            <strong>{inputState === "failed" ? "Imagen no disponible desde backend" : "Verificándo input.png real"}</strong>
            <span>No se renderiza una resonancia simulada. El visor espera el recurso real `input.png` de la corrida.</span>
          </div>
        )}
      </div>

      <div className="viewer-footer real-viewer-footer">
        <span>{overlayLoaded ? "overlay.png disponible" : overlayState === "failed" ? "overlay.png no disponible" : "superposición pendiente"}</span>
        <span>{overlayEnabled && overlayLoaded ? `${Math.round(overlayOpacity * 100)}% opacidad` : "Superposición IA deshabilitada si falta el recurso"}</span>
        <span>{landmarkEditMode && canEditLandmarks ? "Edición de landmarks del revisor" : "Corte único servido"}</span>
      </div>
      {overlayState === "failed" && <div className="panel-hidden-placeholder">overlay.png no disponible desde backend. No se muestra superposición simulada.</div>}
      {!coordinateSpace && <div className="panel-hidden-placeholder">Espacio de coordenadas no informado por backend; mover/agregar landmarks queda deshabilitado para no inventar model_256/original.</div>}
      {coordinateSpace && landmarkEditMode && <div className="panel-hidden-placeholder">Correcciones de landmarks en borrador local no persistido. Pendiente BE-008/FE-010 + AI-011.</div>}
    </div>
  );
}
