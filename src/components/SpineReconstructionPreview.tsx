export function SpineReconstructionPreview() {
  return (
    <div className="spine-preview">
      <div className="viewer-controls">
        <button type="button">Zoom</button>
        <button type="button">Rotate</button>
        <button type="button">Fit</button>
        <div className="segmented-control">
          <button className="active" type="button">Surface</button>
          <button type="button">Volume</button>
        </div>
      </div>
      <svg viewBox="0 0 360 420" role="img" aria-label="3D lumbar spine placeholder">
        <defs>
          <linearGradient id="vertebra" x1="0" x2="1">
            <stop offset="0" stopColor="#dbeafe" />
            <stop offset="1" stopColor="#67e8f9" />
          </linearGradient>
          <linearGradient id="disc" x1="0" x2="1">
            <stop offset="0" stopColor="#7c3aed" />
            <stop offset="1" stopColor="#0891b2" />
          </linearGradient>
        </defs>
        {["L1", "L2", "L3", "L4", "L5", "S1"].map((label, index) => {
          const y = 42 + index * 58;
          const width = index === 5 ? 128 : 104 + index * 6;
          return (
            <g key={label} className="vertebra-group">
              <path
                d={`M${180 - width / 2} ${y} C${160 - width / 3} ${y - 16}, ${200 + width / 3} ${y - 16}, ${180 + width / 2} ${y} C${206 + width / 3} ${y + 28}, ${154 - width / 3} ${y + 28}, ${180 - width / 2} ${y}Z`}
                fill="url(#vertebra)"
                opacity="0.94"
              />
              {index < 5 && <ellipse cx="180" cy={y + 40} rx={52 + index * 4} ry="12" fill="url(#disc)" opacity="0.8" />}
              <text x="286" y={y + 8}>{label}</text>
              <line x1="246" y1={y + 4} x2="278" y2={y + 4} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
