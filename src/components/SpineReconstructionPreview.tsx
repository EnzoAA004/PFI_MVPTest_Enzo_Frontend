import type { ThreeDProxyViewModel } from "../viewModels/threeDProxyViewModel";
import { ExperimentalProxyViewer } from "./ExperimentalProxyViewer";
import { GenericAtlasPreview, type LegacyThreeDContract } from "./GenericAtlasPreview";

/**
 * Router between the two 3D presentations. They are mutually exclusive by
 * design: when `proxy` is provided (a real ThreeDProxyViewModel, in any
 * state — available, blocked or errored) the generic atlas never renders,
 * so the clinical review flow can never show a non-patient-specific mesh as
 * if it were a result. `threeD` (legacy shape) is kept only for existing
 * callers that predate P9-C.5 and never pass `proxy`.
 */
type Props = {
  threeD?: LegacyThreeDContract | null;
  proxy?: ThreeDProxyViewModel;
};

export function SpineReconstructionPreview({ threeD, proxy }: Props) {
  if (proxy) return <ExperimentalProxyViewer viewModel={proxy} />;
  return <GenericAtlasPreview threeD={threeD} />;
}
