import { clearAuthSession } from "../authStorage";
import { asyncRemoveItem } from "../browserStorage";

/** Fired whenever the session is invalidated by a failed/absent refresh, so App.tsx can drop in-memory state and redirect to login. */
export const SESSION_INVALIDATED_EVENT = "pfi:session-invalidated";

const REVIEW_HISTORY_KEY = "lumbar-mri-review-history-v1";
/*
 * El estudio seleccionado ya no se persiste: viaja por props desde App. La clave se
 * sigue borrando en el logout para limpiar el residuo que dejaron las versiones que
 * sí lo escribían en sessionStorage, en un navegador que todavía no lo tenga limpio.
 */
const SELECTED_STUDY_KEY = "pfi.selectedStudyDetail";
const CROSS_TAB_CHANNEL = "pfi-session-sync";

// IndexedDB (where the session lives, see authStorage.ts) doesn't fire the
// native `storage` event across tabs the way localStorage does, so
// BroadcastChannel is the cross-tab equivalent the ticket calls for.
function crossTabChannel(): BroadcastChannel | undefined {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return undefined;
  try {
    return new BroadcastChannel(CROSS_TAB_CHANNEL);
  } catch {
    return undefined;
  }
}

/** Called when a refresh attempt fails definitively: clears the session and notifies listeners (P10-C.1 §3). */
export function notifySessionInvalidated() {
  clearAuthSession();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_INVALIDATED_EVENT));
  crossTabChannel()?.postMessage({ type: "session-invalidated" });
}

/**
 * Clears every protected data store on logout (manual or forced), per
 * P10-C.1 §4. Deliberately leaves non-sensitive visual preferences
 * (lumbar-mri-professional-settings-v1: language/density/notifications)
 * untouched.
 */
export async function clearAllProtectedData(options: { broadcast?: boolean } = {}): Promise<void> {
  clearAuthSession();
  await asyncRemoveItem(REVIEW_HISTORY_KEY);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SELECTED_STUDY_KEY);
    } catch {
      // sessionStorage unavailable (private mode, etc.) — best-effort cleanup.
    }
  }
  if (options.broadcast !== false) crossTabChannel()?.postMessage({ type: "logout" });
}

/** Subscribes to cross-tab logout/session-invalidation; returns an unsubscribe function. */
export function onCrossTabSessionSync(onSync: () => void): () => void {
  const channel = crossTabChannel();
  if (!channel) return () => undefined;
  const handler = (event: MessageEvent) => {
    const type = (event.data as { type?: string } | undefined)?.type;
    if (type === "logout" || type === "session-invalidated") onSync();
  };
  channel.addEventListener("message", handler);
  return () => {
    channel.removeEventListener("message", handler);
    channel.close();
  };
}
