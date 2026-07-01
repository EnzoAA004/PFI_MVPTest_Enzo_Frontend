import type { AgentDecision } from "../types";
import { StatusBadge } from "./StatusBadge";

export function AgentSummary({ agentDecision }: { agentDecision?: AgentDecision }) {
  const flags = agentDecision?.flags ?? agentDecision?.agentReasons ?? [];
  const reasons = agentDecision?.reasons ?? agentDecision?.agentReasons ?? [];
  return (
    <section className="panel-card">
      <div className="section-title">
        <h2>AI Agent Summary</h2>
        <StatusBadge tone="amber">{agentDecision?.priority ?? "media"}</StatusBadge>
      </div>
      <dl className="agent-grid">
        <div><dt>Status</dt><dd>{agentDecision?.status ?? agentDecision?.agentStatus ?? "requiere_revision"}</dd></div>
        <div><dt>Human review</dt><dd>{agentDecision?.humanReviewRequired === false ? "Optional" : "Required"}</dd></div>
        <div><dt>Clinical use</dt><dd>{agentDecision?.notClinicalDiagnosis === false ? "Restricted" : "Not for clinical diagnosis"}</dd></div>
      </dl>
      <p className="muted">{agentDecision?.recommendedAction}</p>
      <div className="chip-row">
        {flags.map((flag) => <span className="chip" key={flag}>{flag}</span>)}
      </div>
      <ul className="compact-list">
        {reasons.map((reason) => <li key={reason}>{reason}</li>)}
      </ul>
    </section>
  );
}
