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
        <h2>AI Agent Summary</h2>
        <div className="panel-title-actions">
          <StatusBadge tone="amber">{agentDecision?.priority ?? "media"}</StatusBadge>
          <button className={`visibility-toggle ${visible ? "is-visible" : "is-hidden"}`} onClick={() => setVisible((value) => !value)} type="button" aria-label={visible ? "Hide AI Agent Summary" : "Show AI Agent Summary"} title={visible ? "Hide AI Agent Summary" : "Show AI Agent Summary"}><VisibilityIcon visible={visible} /></button>
        </div>
      </div>
      {visible ? (
        <>
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
        </>
      ) : <div className="panel-hidden-placeholder">Panel hidden. Use the visibility control to expand it.</div>}
    </section>
  );
}
