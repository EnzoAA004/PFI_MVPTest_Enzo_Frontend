import type { VolumeStack } from "../contracts/volumeStack";
import { useVolumeStack } from "../viewModels/volumeStackViewModel";
import { StatusBadge } from "./StatusBadge";

/**
 * Viewer shell for a volume stack. It renders only previews supplied by the
 * backend and uses an explicit placeholder instead of fabricating overlays.
 */
function planeLabel(plane: VolumeStack["plane"]): string {
  return plane === "sagittal" ? "Sagital" : "Axial";
}

export function VolumeStackViewer({ stack }: { stack: VolumeStack }) {
  const nav = useVolumeStack(stack);
  const slice = nav.currentSlice;
  const lastIndex = Math.max(0, stack.sliceCount - 1);

  return (
    <section className="panel-card compact-card volume-stack-viewer">
      <div className="section-title">
        <h3>{planeLabel(stack.plane)} — visor de stack</h3>
        <StatusBadge tone={nav.isSelectedSlice ? "green" : "blue"}>
          {nav.isSelectedSlice ? "corte analizado por IA" : "corte sin análisis"}
        </StatusBadge>
      </div>
      <p className="muted compact-copy">
        Corte {nav.currentIndex + 1} / {nav.total}
        {stack.dimensions ? ` · volumen ${stack.dimensions.join("×")}` : ""}
        {stack.inPlaneSpacingMm ? ` · spacing ${stack.inPlaneSpacingMm.join("×")} mm` : ""}
      </p>
      <div className="volume-stack-canvas">
        {slice?.imageUrl ? (
          <img src={slice.imageUrl} alt={`Corte ${nav.currentIndex + 1} de ${nav.total} (${planeLabel(stack.plane)})`} />
        ) : (
          <div className="volume-stack-placeholder">
            Sin preview para este corte todavía. Solo el corte analizado por IA
            ({stack.selectedSliceIndex + 1}/{nav.total}) tiene imagen.
          </div>
        )}
      </div>
      <div className="volume-stack-controls">
        <button type="button" onClick={nav.prev} disabled={nav.currentIndex <= 0}>Anterior</button>
        <input
          type="range"
          min={0}
          max={lastIndex}
          value={nav.currentIndex}
          aria-label="Índice de corte"
          onChange={(event) => nav.setIndex(Number(event.target.value))}
        />
        <button type="button" onClick={nav.next} disabled={nav.currentIndex >= lastIndex}>Siguiente</button>
        <button type="button" onClick={nav.goToSelected} disabled={nav.isSelectedSlice}>Ir al corte IA</button>
      </div>
    </section>
  );
}
