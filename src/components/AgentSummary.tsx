import { useState } from "react";
import type { AgentDecision } from "../appTypes";
import { StatusBadge } from "./StatusBadge";
import { VisibilityIcon } from "./VisibilityIcon";

export function AgentSummary({ agentDecision }: { agentDecision?: AgentDecision }) {
  const [visible, setVisible] = useState(true);
  const flags = agentDecision?.flags ?? agentDecision?.agentReasons ?? [];
  const reasons = agentDecision?.reasons ?? agentDecision?.agentReasons ?? [];
  return (
    <section className="panel-card">
      <div className="section-title">
        <h2>Resumen del agente IA</h2>
        <div className="panel-title-actions">
          <StatusBadge tone="amber">{agentDecision?.priority ?? "media"}</StatusBadge>
          <button className={`visibility-toggle ${visible ? "is-visible" : "is-hidden"}`} onClick={() => setVisible((value) => !value)} type="button" aria-label={visible ? "Ocultar resumen del agente IA" : "Mostrar resumen del agente IA"} title={visible ? "Ocultar resumen del agente IA" : "Mostrar resumen del agente IA"}><VisibilityIcon visible={visible} /></button>
        </div>
      </div>
      {visible ? (
        <>
          <dl className="agent-grid">
            <div><dt>Estado</dt><dd>{agentDecision?.status ?? agentDecision?.agentStatus ?? "requiere_revisión"}</dd></div>
            <div><dt>Revisión humana</dt><dd>{agentDecision?.humanReviewRequerida === false ? "Opcional" : "Requerida"}</dd></div>
            <div><dt>Usá clínico</dt><dd>{agentDecision?.notClinicalDiagnosis === false ? "Restringido" : "No apto para diagnóstico clínico"}</dd></div>
          </dl>
          <div className="ai-honesty-row">
            <StatusBadge tone="amber">Revisión humana requerida</StatusBadge>
            <StatusBadge tone="purple">La salida IA puede ser inexacta. Verificá todos los resultados.</StatusBadge>
          </div>
          <p className="muted">{agentDecision?.recommendedAction}</p>
          <div className="chip-row">
            {flags.map((flag) => <span className="chip" key={flag}>{flag}</span>)}
          </div>
          <ul className="compact-list">
            {reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </>
      ) : <div className="panel-hidden-placeholder">Panel oculto. Usá el control de visualización para desplegarlo.</div>}
    </section>
  );
}
