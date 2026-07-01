interface MriSliceViewerProps {
  variant: "sagittal" | "axial";
  overlayEnabled: boolean;
  editMode: boolean;
  selectedLandmark: string;
  onSelectMask: (mask: string) => void;
  onSelectLandmark: (landmark: string) => void;
}

export function MriSliceViewer({
  variant,
  overlayEnabled,
  editMode,
  selectedLandmark,
  onSelectMask,
  onSelectLandmark,
}: MriSliceViewerProps) {
  const isSagittal = variant === "sagittal";
  const labels = isSagittal ? ["L1", "L2", "L3", "L4", "L5", "S1"] : ["Canal", "Root L", "Root R"];

  return (
    <div className={`mri-viewer ${variant}`}>
      <div className="viewer-caption">
        <strong>{isSagittal ? "Sagittal T2 viewer" : "Axial T2 viewer"}</strong>
        <span>{editMode ? "Mask editing enabled" : "AI overlay review mode"}</span>
      </div>
      <div className="slice-canvas">
        <div className="scan-noise" />
        {overlayEnabled && (
          <>
            <button className="mask mask-canal" onClick={() => onSelectMask("canal")} type="button" />
            <button className="mask mask-disc" onClick={() => onSelectMask("disc-space")} type="button" />
            <button className="mask mask-root" onClick={() => onSelectMask("nerve-root")} type="button" />
          </>
        )}
        {labels.map((label, index) => (
          <button
            className={`landmark ${selectedLandmark === label ? "selected" : ""}`}
            key={label}
            onClick={() => onSelectLandmark(label)}
            style={isSagittal ? { top: `${17 + index * 12}%`, left: `${59 - index * 2}%` } : { top: `${42 + index * 8}%`, left: `${33 + index * 15}%` }}
            type="button"
          >
            {label}
          </button>
        ))}
        <div className="ruler">
          <span />
          <em>{isSagittal ? "13.8 mm" : "14.2 mm"}</em>
        </div>
      </div>
    </div>
  );
}
