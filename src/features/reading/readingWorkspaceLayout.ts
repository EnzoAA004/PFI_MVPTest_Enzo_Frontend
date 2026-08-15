export type ReadingLayoutPreset = "reading" | "sagittal-axial" | "t1-t2";
export type ReadingPlane = "sagittal" | "axial";

export type ViewportBinding = {
  id: string;
  plane: ReadingPlane;
  defaultSeriesInputId?: string;
  role: "analyzed" | "reference";
};

type LayoutAvailability = {
  activePlane: ReadingPlane;
  axialAvailable: boolean;
  sagittalT1InputId?: string;
  sagittalT2InputId?: string;
};

/**
 * Bindings mínimos de la grilla. Cada binding conserva una key propia: no existe
 * sincronización de cortes implícita entre planos ni ponderaciones.
 */
export function viewportBindingsFor(
  preset: ReadingLayoutPreset,
  availability: LayoutAvailability,
): ViewportBinding[] {
  if (preset === "sagittal-axial" && availability.axialAvailable) {
    return [
      { id: "sagittal", plane: "sagittal", role: "analyzed" },
      { id: "axial", plane: "axial", role: "analyzed" },
    ];
  }
  if (preset === "t1-t2" && availability.sagittalT1InputId && availability.sagittalT2InputId) {
    return [
      { id: "sagittal-t1", plane: "sagittal", defaultSeriesInputId: availability.sagittalT1InputId, role: "reference" },
      { id: "sagittal-t2", plane: "sagittal", defaultSeriesInputId: availability.sagittalT2InputId, role: "reference" },
    ];
  }
  return [{ id: availability.activePlane, plane: availability.activePlane, role: "analyzed" }];
}

export function layoutPresetAvailable(
  preset: ReadingLayoutPreset,
  availability: LayoutAvailability,
) {
  if (preset === "sagittal-axial") return availability.axialAvailable;
  if (preset === "t1-t2") return Boolean(availability.sagittalT1InputId && availability.sagittalT2InputId);
  return true;
}
