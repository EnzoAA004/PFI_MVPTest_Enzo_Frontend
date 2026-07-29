import { useCallback, useEffect, useState } from "react";
import type { VolumeSlice, VolumeStack } from "../contracts/volumeStack";

/**
 * P10.5-D.0 — slice-navigation state for the stack viewer.
 *
 * The pure functions below hold all the index math (clamp, step, initial slice)
 * so they can be unit-tested without React; `useVolumeStack` is a thin hook that
 * wires them to component state. Full scroll/keyboard/thumbnail navigation is
 * P10.5-D.1 and builds on top of this.
 */
export function clampSliceIndex(index: number, sliceCount: number): number {
  const max = Math.max(0, sliceCount - 1);
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), max);
}

export function initialSliceIndex(stack: VolumeStack): number {
  return clampSliceIndex(stack.selectedSliceIndex, stack.sliceCount);
}

export function stepSliceIndex(current: number, delta: number, sliceCount: number): number {
  return clampSliceIndex(current + delta, sliceCount);
}

export function sliceAt(stack: VolumeStack, index: number): VolumeSlice | undefined {
  const safe = clampSliceIndex(index, stack.sliceCount);
  return stack.slices[safe];
}

export type VolumeStackController = {
  currentIndex: number;
  currentSlice: VolumeSlice | undefined;
  total: number;
  isSelectedSlice: boolean;
  setIndex: (index: number) => void;
  next: () => void;
  prev: () => void;
  goToSelected: () => void;
};

export function useVolumeStack(stack: VolumeStack): VolumeStackController {
  const [currentIndex, setCurrentIndex] = useState(() => initialSliceIndex(stack));

  // Re-center on the AI slice whenever the underlying series changes.
  useEffect(() => {
    setCurrentIndex(initialSliceIndex(stack));
  }, [stack.seriesId, stack.sliceCount, stack.selectedSliceIndex]);

  const setIndex = useCallback((index: number) => {
    setCurrentIndex(clampSliceIndex(index, stack.sliceCount));
  }, [stack.sliceCount]);

  const next = useCallback(() => {
    setCurrentIndex((current) => stepSliceIndex(current, 1, stack.sliceCount));
  }, [stack.sliceCount]);

  const prev = useCallback(() => {
    setCurrentIndex((current) => stepSliceIndex(current, -1, stack.sliceCount));
  }, [stack.sliceCount]);

  const goToSelected = useCallback(() => {
    setCurrentIndex(initialSliceIndex(stack));
  }, [stack.seriesId, stack.sliceCount, stack.selectedSliceIndex]);

  return {
    currentIndex,
    currentSlice: sliceAt(stack, currentIndex),
    total: stack.sliceCount,
    isSelectedSlice: currentIndex === stack.selectedSliceIndex,
    setIndex,
    next,
    prev,
    goToSelected,
  };
}
