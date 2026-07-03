import { useEffect, useState } from "react";
import { getMultiplanarContract } from "../multiplanarApi";
import { panelOrder, readyPlaneCount, type MultiplanarContract } from "../multiplanarTypes";
import { StatusBadge } from "./StatusBadge";

function labelForPanel(panel: string) {
  if (panel === "sagittal") return "Sagital";
  if (panel === "axial") return "Axial";
  return "3D futuro";
}

export function MultiplanarWorkspaceCard() {
  const [contract, setContract] = useState<MultiplanarContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      setContract(await getMultiplanarContract());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo consultar contrato multiplanar");
      setContract({ status: "multiplanar_unavailable", workspaceMode: "dual_plane_with_3d_context", humanReviewRequired: true, notClinicalDiagnosis: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const ready = readyPlaneCount(contract ?? undefined);
  const status = String(contract?.status ?? "consultando");
  const planes = contract?.planes ?? {};

  return (
    <section className="panel-card compact-card">
      <div className="section-title">
        <h2>Workspace multiplanar</h2>
        <StatusBadge tone={ready === 2 ? "green" : ready === 1 ? "amber" : "blue"}>{ready}/2 modelos</StatusBadge>
      </div>
      <p className="muted compact-copy">
        Base técnica para visualizar sagital, axial y reconstrucción 3D futura con máscaras, landmarks y mediciones sincronizadas.
      </p>
      {message && <div className="toast info">{message}</div>}
      <dl className="info-list compact-info">
        <div><dt>Estado</dt><dd>{status}</dd></div>
        <div><dt>Modo</dt><dd>{String(contract?.workspaceMode ?? "dual_plane_with_3d_context")}</dd></div>
        <div><dt>Revisión humana</dt><dd>{contract?.humanReviewRequired === false ? "no" : "sí"}</dd></div>
      </dl>
      <div className="comparison-table unified-results-table ai-completion-table">
        <div className="comparison-head"><span>Panel</span><span>Preparación</span></div>
        {panelOrder().map((panel) => {
          const plane = panel === "three_d" ? undefined : planes[panel];
          const detail = panel === "three_d"
            ? String(contract?.threeD?.status ?? "planned_from_registered_masks")
            : `${plane?.readiness ?? "pendiente"}${plane?.baselineReady ? " / baseline listo" : ""}`;
          return <div className="comparison-row compact-comparison-row" key={panel}><span>{labelForPanel(panel)}</span><span>{detail}</span></div>;
        })}
      </div>
      <div className="diagnostics-actions">
        <button className="ghost-button" disabled={loading} onClick={() => void refresh()} type="button">Actualizar workspace</button>
      </div>
    </section>
  );
}
