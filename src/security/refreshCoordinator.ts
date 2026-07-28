/**
 * Single-flight coordination for session refresh (P10-C.1 §3). Every
 * refresh call site (api.ts, multiplanarApi.ts, studyApi.ts,
 * subjectHistoryApi.ts, pipelineContractApi.ts, reviewPersistenceApi.ts)
 * calls authClient.refreshDoctorSession(), which routes through this
 * coordinator so concurrent 401s share one in-flight refresh instead of
 * racing separate refresh-token exchanges.
 */

let inFlight: Promise<unknown> | null = null;

export function coordinateRefresh<T>(run: () => Promise<T>): Promise<T> {
  if (inFlight) return inFlight as Promise<T>;
  const promise = run().finally(() => {
    inFlight = null;
  });
  inFlight = promise;
  return promise;
}
