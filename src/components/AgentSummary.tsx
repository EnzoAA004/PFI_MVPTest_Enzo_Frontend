import { useState } from "react";
import type { AgentDecision } from "../appTypes";
import { StatusBadge } from "./StatusBadge";
import { VisibilityIcon } from "./VisibilityIcon";

/**
 * Resumen del agente. Se muestra sólo cuando el agente tiene algo que decir
 * sobre *este* estudio.
 *
 * El panel mezclaba dos cosas. Una es texto de gobernanza —"revisión humana
 * requerida", "no constituye diagnóstico autónomo"— que es idéntico en todos
 * los estudios y que ya está en la barra superior de la sala de lectura y en
 * la pantalla de ayuda. La otra son `flags`, `reasons` y `recommendedAction`,
 * que sí describen la corrida.
 *
 * El backend sólo emite `agentDecision` en el camino degradado, cuando no pudo
 * llamar al módulo de IA (`ai_module_unavailable` y el motivo). En una corrida
 * normal no lo manda y `normalizeAgentDecision` rellena los valores por
 * defecto, así que el panel quedaba ocupando el centro de la pestaña de
 * revisión —donde se escriben las notas del informe— para repetir por tercera
 * vez una advertencia que no cambia nunca.
 *
 * Ahora sin contenido propio no se renderiza. La advertencia permanente no se
 * pierde: sigue en la barra superior, visible durante toda la lectura.
 */
export function AgentSummary({ agentDecision }: { agentDecision?: AgentDecision }) {
  const [visible, setVisible] = useState(true);
  const flags = agentDecision?.flags ?? agentDecision?.agentReasons ?? [];
  const reasons = agentDecision?.reasons ?? agentDecision?.agentReasons ?? [];
  const recommendedAction = agentDecision?.recommendedAction?.trim();
  const hasAgentContent = flags.length > 0 || reasons.length > 0 || Boolean(recommendedAction);
  if (!hasAgentContent) return null;
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
            <div><dt>Revisión humana</dt><dd>{agentDecision?.humanReviewRequired === false ? "Opcional" : "Requerida"}</dd></div>
            <div><dt>Alcance</dt><dd>{agentDecision?.notClinicalDiagnosis === false ? "Uso clínico restringido" : "No constituye diagnóstico autónomo"}</dd></div>
          </dl>
          <div className="ai-honesty-row">
            <StatusBadge tone="amber">Revisión humana requerida</StatusBadge>
            <StatusBadge tone="purple">La salida IA puede ser inexacta. Verificá todos los resultados.</StatusBadge>
          </div>
          {recommendedAction ? <p className="muted">{recommendedAction}</p> : null}
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
