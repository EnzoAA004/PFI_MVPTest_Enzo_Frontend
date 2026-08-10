import type { Plane } from "../appTypes";

/**
 * Frontend domain for navigating a volume stack. Only assets explicitly supplied
 * for a slice may be rendered; every other index remains a placeholder.
 */
export type VolumeSlice = {
  /** 0-based index within the stack (0..sliceCount-1). */
  index: number;
  /** True for the single slice the AI actually inferred (selectedSliceIndex). */
  isSelected: boolean;
  /** True when the slice has real results such as overlay or measurements. */
  hasResult: boolean;
  /** Preview image URL, present only where a real asset exists. */
  imageUrl?: string;
  /** Overlay image URL, present only where a real asset exists. */
  overlayUrl?: string;
};

export type VolumeStack = {
  plane: Plane;
  /** Stable series/volume identifier (planeRunId from the canonical run). */
  seriesId: string;
  sliceCount: number;
  /** The slice the AI inferred, clamped into [0, sliceCount-1]. */
  selectedSliceIndex: number;
  /** Canonical volume dimensions when available (canonicalShape). */
  dimensions?: number[];
  /** In-plane spacing in millimetres when available. */
  inPlaneSpacingMm?: number[];
  /** Ordered slices 0..sliceCount-1. */
  slices: VolumeSlice[];
};

export type VolumeWorkspace = {
  sagittal?: VolumeStack;
  axial?: VolumeStack;
};
