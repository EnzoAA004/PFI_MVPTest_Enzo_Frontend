import { normalizeRun } from "../api";
import type { AiRunResponse } from "../appTypes";
import type { MultiplanarRunResponse } from "../multiplanarRunTypes";
import { StatusBadge } from "./StatusBadge";

function count(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function PlanePanel({ title, run }: { title: string; run?: AiRunResponse }) {
  const normalized = normalizeRun(run);
  const mode = String(normalized.aiOutput?.inferenceMode ?? "contract");
  const requestedMode = String(normalized.aiOutput?.requestedInferenceMode ?? mode);
  const masks = count(normalized.masks);
  const measurements = count(normalized.normalizedMeasurements);
  const series = normalized.series?.find((item) => item.plane === normalized.plane) ?? normalized.series?.[0];
  const visualUrl = series?.overlayUrl ?? series?.imageUrl ?? null;

  return (
    <article className="panel-card compact-card">
      <div className="section-title">
        <h3>{title}</h3>
        <StatusBadge tone={mode === "real_baseline" ? "green" : "blue"}>{mode}</StatusBadge>
      </div>
      <div style={{ minHeight: 220, display: "grid", placeItems: "center", border: "1px solid var(--border-color, #d7dde5)", borderRadius: 10, overflow: "hidden" }}>
        {visualUrl
          ? <img src={visualUrl} alt={`Resultado ${title}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <div className="muted compact-copy" style={{ textAlign: "center", padding: 20 }}>Serie preparada. La imagen real aparecerá cuando el runtime PyTorch entregue imageUrl/overlayUrl.</div>}
      </div>
      <dl className="info-list compact-info">
        <div><dt>Modelo</dt><dd>{normalized.modelKey ?? "sin modelo"}</dd></div>
        <div><dt>Run</dt><dd>{normalized.runId ?? "sin run"}</dd></div>
        <div><dt>Solicitado</dt><dd>{requestedMode}</dd></div>
        <div><dt>Máscaras</dt><dd>{masks}</dd></div>
        <div><dt>Mediciones</dt><dd>{measurements}</dd></div>
      </dl>
    </article>
  );
}

export function MultiplanarReviewView({ run }: { run: MultiplanarRunResponse }) {
  const threeDStatus = String(run.threeD?.status ?? "pending_registered_reconstruction");

  return (
    <section className="panel-card">
      <div className="section-title">
        <div>
          <h2>Revisión multiplanar</h2>
          <p className="muted compact-copy">Caso {run.caseId ?? "sin caso"} · Run {run.runId ?? "sin run"}</p>
        </div>
        <StatusBadge tone={run.effectiveInferenceMode === "real_baseline" ? "green" : "amber"}>{String(run.effectiveInferenceMode ?? "contract")}</StatusBadge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <PlanePanel title="Sagital" run={run.planes?.sagittal} />
        <PlanePanel title="Axial" run={run.planes?.axial} />
        <article className="panel-card compact-card">
          <div className="section-title">
            <h3>3D</h3>
            <StatusBadge tone="blue">preparado</StatusBadge>
          </div>
          <div style={{ minHeight: 220, display: "grid", placeItems: "center", border: "1px dashed var(--border-color, #d7dde5)", borderRadius: 10 }}>
            <div style={{ textAlign: "center", padding: 20 }}>
              <strong>Reconstrucción 3D futura</strong>
              <p className="muted compact-copy">Se derivará de máscaras sagitales y axiales registradas, spacing y mapeo de slices.</p>
            </div>
          </div>
          <dl className="info-list compact-info">
            <div><dt>Estado</dt><dd>{threeDStatus}</dd></div>
            <div><dt>Fuente</dt><dd>sagital + axial</dd></div>
            <div><dt>Edición</dt><dd>pendiente</dd></div>
          </dl>
        </article>
      </div>

      <p className="muted compact-copy" style={{ marginTop: 14 }}>
        Revisión profesional obligatoria. Esta salida técnica no constituye diagnóstico clínico autónomo.
      </p>
    </section>
  );
}
