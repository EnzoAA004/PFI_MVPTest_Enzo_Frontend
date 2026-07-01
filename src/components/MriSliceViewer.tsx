interface MriSliceViewerProps {
  variant: "sagittal" | "axial";
  overlayEnabled: boolean;
  overlayOpacity?: number;
  editMode: boolean;
  selectedLandmark: string;
  onSelectMask: (mask: string) => void;
  onSelectLandmark: (landmark: string) => void;
}

const sagittalLabels = ["L1", "L2", "L3", "L4", "L5", "S1"];
const axialLabels = ["Canal", "Root L", "Root R", "Lamina", "Facet"];

export function MriSliceViewer({
  variant,
  overlayEnabled,
  overlayOpacity = 0.74,
  editMode,
  selectedLandmark,
  onSelectMask,
  onSelectLandmark,
}: MriSliceViewerProps) {
  const isSagittal = variant === "sagittal";
  const labels = isSagittal ? sagittalLabels : axialLabels;
  const sliceLabel = isSagittal ? "96 / 96" : "24 / 48";

  return (
    <div className={`mri-viewer ${variant}`}>
      <div className="viewer-caption">
        <div>
          <strong>{isSagittal ? "Sagittal T2" : "Axial T2 L4-L5"}</strong>
          <span>{editMode ? "Mask editing enabled" : "AI overlay review mode"}</span>
        </div>
        <div className="dicom-meta">
          <em>Slice {sliceLabel}</em>
          <em>W 1500</em>
          <em>L 450</em>
        </div>
      </div>
      <div className={`slice-canvas ${isSagittal ? "sagittal-canvas" : "axial-canvas"}`}>
        <div className="scan-noise" />
        <div className="scan-ruler vertical" />
        <div className="scan-ruler horizontal" />
        {overlayEnabled && (
          <div className="overlay-layer" style={{ opacity: overlayOpacity }}>
            <button className="mask mask-canal" onClick={() => onSelectMask("canal")} type="button" aria-label="Seleccionar canal espinal" />
            <button className="mask mask-disc" onClick={() => onSelectMask("disc-space")} type="button" aria-label="Seleccionar disco intervertebral" />
            <button className="mask mask-root" onClick={() => onSelectMask("nerve-root")} type="button" aria-label="Seleccionar raiz nerviosa" />
            {!isSagittal && <button className="mask mask-facet" onClick={() => onSelectMask("facet-joint")} type="button" aria-label="Seleccionar faceta" />}
          </div>
        )}
        {labels.map((label, index) => (
          <button
            className={`landmark ${selectedLandmark === label ? "selected" : ""}`}
            key={label}
            onClick={() => onSelectLandmark(label)}
            style={isSagittal ? { top: `${15 + index * 12.8}%`, left: `${61 - index * 2.4}%` } : { top: `${34 + index * 8.2}%`, left: `${30 + index * 12.5}%` }}
            type="button"
          >
            {label}
          </button>
        ))}
        <div className="ruler">
          <span />
          <em>{isSagittal ? "13.8 mm" : "14.2 mm"}</em>
        </div>
        <div className="orientation-markers">
          <span>{isSagittal ? "A" : "R"}</span>
          <span>{isSagittal ? "P" : "L"}</span>
        </div>
      </div>
      <div className="viewer-footer">
        <span>AI overlay</span>
        <div className="slice-timeline"><i style={{ width: isSagittal ? "82%" : "50%" }} /></div>
        <span>{overlayEnabled ? `${Math.round(overlayOpacity * 100)}% opacity` : "disabled"}</span>
      </div>
    </div>
  );
}
