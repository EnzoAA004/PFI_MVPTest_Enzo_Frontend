interface MriSliceViewerProps {
  variant: "sagittal" | "axial";
  series?: any;
  masks?: any[];
  landmarks?: any[];
  maskVisibility?: Record<string, boolean>;
  sliceIndex?: number;
  overlayEnabled: boolean;
  overlayOpacity?: number;
  editMode: boolean;
  selectedMask: string;
  selectedLandmark: string;
  onSelectMask: (mask: string) => void;
  onSelectLandmark: (landmark: string) => void;
  onSliceChange?: (slice: number) => void;
}

const sagittalLabels = ["L1", "L2", "L3", "L4", "L5", "S1"];
const axialLabels = ["Canal", "Root L", "Root R", "Lamina", "Facet"];

function maskCssClass(mask: any) {
  const name = String(mask?.className ?? mask?.id ?? "").toLowerCase();
  if (name.includes("canal")) return "mask-canal";
  if (name.includes("disc")) return "mask-disc";
  if (name.includes("root") || name.includes("foramen")) return "mask-root";
  if (name.includes("facet")) return "mask-facet";
  return "mask-disc";
}

function contourPoints(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function MriSliceViewer({
  variant,
  series,
  masks = [],
  landmarks = [],
  maskVisibility = {},
  sliceIndex,
  overlayEnabled,
  overlayOpacity = 0.74,
  editMode,
  selectedMask,
  selectedLandmark,
  onSelectMask,
  onSelectLandmark,
  onSliceChange,
}: MriSliceViewerProps) {
  const isSagittal = variant === "sagittal";
  const fallbackLabels = isSagittal ? sagittalLabels : axialLabels;
  const currentSlice = sliceIndex ?? series?.selectedSlice ?? (isSagittal ? 58 : 24);
  const sliceCount = series?.sliceCount ?? (isSagittal ? 96 : 48);
  const activeMasks = masks.filter((mask) => maskVisibility[mask.id] ?? mask.enabled ?? true);
  const visibleContours = activeMasks.flatMap((mask) =>
    (mask.contours ?? [])
      .filter((contour: any) => !series?.id || contour.seriesId === series.id)
      .map((contour: any) => ({ mask, contour })),
  );
  const visibleLandmarks = landmarks.filter((landmark) => !series?.id || landmark.seriesId === series.id);

  return (
    <div className={`mri-viewer ${variant}`}>
      <div className="viewer-caption">
        <div>
          <strong>{series?.name ?? (isSagittal ? "Sagittal T2" : "Axial T2 L4-L5")}</strong>
          <span>{editMode ? "Mask editing enabled" : "AI overlay review mode"}</span>
        </div>
        <div className="dicom-meta">
          <em>Slice {currentSlice} / {sliceCount}</em>
          <em>W 1500</em>
          <em>L 450</em>
        </div>
      </div>
      <div className={`slice-canvas ${isSagittal ? "sagittal-canvas" : "axial-canvas"}`}>
        <div className="scan-noise" />
        <div className="scan-ruler vertical" />
        <div className="scan-ruler horizontal" />
        {overlayEnabled && visibleContours.length > 0 && (
          <svg className="contour-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ opacity: overlayOpacity }}>
            {visibleContours.map(({ mask, contour }: any, index: number) => (
              <polygon
                key={`${mask.id}-${index}`}
                points={contourPoints(contour.points ?? [])}
                fill={mask.color ?? "#2563eb"}
                stroke={selectedMask === mask.id ? "#facc15" : "rgba(255,255,255,.72)"}
                strokeWidth={selectedMask === mask.id ? 1.2 : 0.45}
                onClick={() => onSelectMask(mask.id)}
              />
            ))}
          </svg>
        )}
        {overlayEnabled && visibleContours.length === 0 && (
          <div className="overlay-layer" style={{ opacity: overlayOpacity }}>
            <button className="mask mask-canal" onClick={() => onSelectMask("canal")} type="button" aria-label="Seleccionar canal espinal" />
            <button className="mask mask-disc" onClick={() => onSelectMask("disc-space")} type="button" aria-label="Seleccionar disco intervertebral" />
            <button className="mask mask-root" onClick={() => onSelectMask("nerve-root")} type="button" aria-label="Seleccionar raiz nerviosa" />
            {!isSagittal && <button className="mask mask-facet" onClick={() => onSelectMask("facet-joint")} type="button" aria-label="Seleccionar faceta" />}
          </div>
        )}
        {(visibleLandmarks.length > 0 ? visibleLandmarks : fallbackLabels.map((label, index) => ({ id: label, label, x: isSagittal ? 61 - index * 2.4 : 30 + index * 12.5, y: isSagittal ? 15 + index * 12.8 : 34 + index * 8.2 }))).map((landmark: any) => (
          <button
            className={`landmark ${selectedLandmark === landmark.id || selectedLandmark === landmark.label ? "selected" : ""}`}
            key={landmark.id ?? landmark.label}
            onClick={() => onSelectLandmark(landmark.id ?? landmark.label)}
            style={{ top: `${landmark.y}%`, left: `${landmark.x}%` }}
            type="button"
            title={landmark.label}
          >
            {String(landmark.label ?? landmark.id).replace(" superior endplate", "").replace(" inferior endplate", "")}
          </button>
        ))}
        <div className="ruler"><span /><em>{isSagittal ? "13.8 mm" : "14.2 mm"}</em></div>
        <div className="orientation-markers"><span>{isSagittal ? "A" : "R"}</span><span>{isSagittal ? "P" : "L"}</span></div>
      </div>
      <div className="viewer-footer">
        <span>{overlayEnabled ? "AI overlay" : "Overlay disabled"}</span>
        <input className="slice-range" min="1" max={sliceCount} value={currentSlice} onChange={(event) => onSliceChange?.(Number(event.target.value))} type="range" />
        <span>{overlayEnabled ? `${Math.round(overlayOpacity * 100)}% opacity` : "disabled"}</span>
      </div>
    </div>
  );
}
