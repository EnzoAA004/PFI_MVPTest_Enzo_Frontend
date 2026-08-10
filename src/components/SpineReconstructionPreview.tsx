import type { ThreeDProxyViewModel } from "../viewModels/threeDProxyViewModel";
import { ExperimentalProxyViewer } from "./ExperimentalProxyViewer";
import { GenericAtlasPreview, type LegacyThreeDContract } from "./GenericAtlasPreview";

/**
 * Router between the two 3D presentations. They are mutually exclusive by
 * design: when `proxy` is provided (a real ThreeDProxyViewModel, in any
 * state — available, blocked or errored) the generic atlas never renders,
 * so the clinical review flow can never show a non-patient-specific mesh as
 * if it were a result. `threeD` (legacy shape) is kept only for existing
 * callers that still provide only the legacy `threeD` payload.
 */
type Props = {
  threeD?: LegacyThreeDContract | null;
  proxy?: ThreeDProxyViewModel;
  onRetryProxy?: () => void;
  selectedStructure?: string | null;
  onSelectStructure?: (label: string | null) => void;
};

export function SpineReconstructionPreview({ threeD, proxy, onRetryProxy, selectedStructure, onSelectStructure }: Props) {
  if (proxy) return <ExperimentalProxyViewer viewModel={proxy} onRetry={onRetryProxy} selectedStructure={selectedStructure} onSelectStructure={onSelectStructure} />;
  return <GenericAtlasPreview threeD={threeD} />;
}
