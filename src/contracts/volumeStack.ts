import type { Plane } from "../appTypes";

/**
 * P10.5-D.0 — viewer shell domain for navigating a .mha stack.
 *
 * This is the Frontend-side shape the stack viewer consumes. It is derived from
 * the P10.5-A volumetric contract (CanonicalPlaneRun.input: sliceCount,
 * selectedSliceIndex, canonicalShape, inPlaneSpacingMm). Until P10.5-B/C expose a
 * real per-slice catalog + previews, only the AI-selected slice carries an image
 * and results; every other index is navigable but has no fabricated preview or
 * overlay (Handoff rule: "los demás se navegan sin overlay fabricado").
 */
export type VolumeSlice = {
  /** 0-based index within the stack (0..sliceCount-1). */
  index: number;
  /** True for the single slice the AI actually inferred (selectedSliceIndex). */
  isSelected: boolean;
  /** True when the slice has real results (overlay/measurements). Only the
   *  selected slice until the catalog exists (P10.5-B/C). */
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
