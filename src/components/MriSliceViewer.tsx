type Props = {
  variant: "sagittal" | "axial";
  series?: any;
  masks?: any[];
  landmarks?: any[];
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
};

const labelsByPlane = {
  sagittal: ["L1", "L2", "L3", "L4", "L5", "S1"],
  axial: ["A", "B", "C", "D", "E"],
};

export function MriSliceViewer({ variant, series, masks = [], landmarks = [], maskVisibility = {}, sliceIndex, overlayEnabled, overlayOpacity = 0.74, editMode, selectedMask = "", selectedLandmark, onSelectMask, onSelectLandmark, onSliceChange }: Props) {
  const isSagittal = variant === "sagittal";
  const sliceCount = series?.sliceCount ?? (isSagittal ? 96 : 48);
  const currentSlice = sliceIndex ?? series?.selectedSlice ?? (isSagittal ? 58 : 24);
  const visibleMasks = masks.filter((mask) => maskVisibility[mask.id] ?? mask.enabled ?? true);
  const marks = landmarks.length ? landmarks : labelsByPlane[variant].map((label, index) => ({ id: label, label, x: isSagittal ? 61 - index * 2.4 : 30 + index * 12.5, y: isSagittal ? 15 + index * 12.8 : 34 + index * 8.2 }));

  return (
    <div className={`mri-viewer ${variant}`}>
      <div className="viewer-caption"><div><strong>{series?.name ?? (isSagittal ? "Sagittal T2" : "Axial T2")}</strong><span>{editMode ? "Mask editing enabled" : "AI overlay review mode"}</span></div><div className="dicom-meta"><em>Slice {currentSlice} / {sliceCount}</em><em>W 1500</em><em>L 450</em></div></div>
      <div className={`slice-canvas ${isSagittal ? "sagittal-canvas" : "axial-canvas"}`}>
        <div className="scan-noise" /><div className="scan-ruler vertical" /><div className="scan-ruler horizontal" />
        {overlayEnabled && <div className="overlay-layer" style={{ opacity: overlayOpacity }}>{visibleMasks.length ? visibleMasks.map((mask) => <button key={mask.id} className={`mask ${selectedMask === mask.id ? "selected-mask" : ""}`} style={{ background: mask.color }} onClick={() => onSelectMask(mask.id)} type="button" />) : <><button className="mask mask-canal" onClick={() => onSelectMask("canal")} type="button" /><button className="mask mask-disc" onClick={() => onSelectMask("disc") } type="button" /><button className="mask mask-root" onClick={() => onSelectMask("root")} type="button" /></>}</div>}
        {marks.map((mark: any) => <button className={`landmark ${selectedLandmark === mark.id || selectedLandmark === mark.label ? "selected" : ""}`} key={mark.id} onClick={() => onSelectLandmark(mark.id)} style={{ top: `${mark.y}%`, left: `${mark.x}%` }} type="button">{String(mark.label).slice(0, 6)}</button>)}
        <div className="ruler"><span /><em>{isSagittal ? "13.8 mm" : "14.2 mm"}</em></div><div className="orientation-markers"><span>{isSagittal ? "A" : "R"}</span><span>{isSagittal ? "P" : "L"}</span></div>
      </div>
      <div className="viewer-footer"><span>{overlayEnabled ? "AI overlay" : "Overlay disabled"}</span><input className="slice-range" min="1" max={sliceCount} value={currentSlice} onChange={(event) => onSliceChange?.(Number(event.target.value))} type="range" /><span>{overlayEnabled ? `${Math.round(overlayOpacity * 100)}% opacity` : "disabled"}</span></div>
    </div>
  );
}
