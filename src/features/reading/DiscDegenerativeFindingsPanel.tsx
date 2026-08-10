import {
  DISC_LEVELS,
  groupDiscFindingsByLevel,
  type DeploymentStatus,
  type DiscFinding,
} from "./discDegenerativeFindings";
import {
  DEPLOYMENT_LABELS,
  DEPLOYMENT_NOTES,
  DEPLOYMENT_ORDER,
  DISC_FINDING_LABELS,
  DISC_FINDINGS_NOTICE,
  startsCollapsed,
} from "./discFindingDisplay";

type Props = {
  findings: DiscFinding[];
  contractError?: string;
  unavailableReason?: string;
};

function FindingRows({ findings }: { findings: DiscFinding[] }) {
  return (
    <div className="rr-disc-finding-rows">
      {findings.map((finding) => (
        <article className="rr-disc-finding" key={finding.findingId}>
          <span>{DISC_FINDING_LABELS[finding.findingType]}</span>
          <strong>{finding.label}</strong>
        </article>
      ))}
    </div>
  );
}

function DeploymentGroup({ status, findings }: { status: DeploymentStatus; findings: DiscFinding[] }) {
  if (!findings.length) return null;
  const heading = (
    <>
      <span className={`rr-disc-deployment is-${status}`}>{DEPLOYMENT_LABELS[status]}</span>
      <small>{DEPLOYMENT_NOTES[status]}</small>
    </>
  );
  if (startsCollapsed(status)) {
    return (
      <details className="rr-disc-deployment-group">
        <summary>{heading}</summary>
        <FindingRows findings={findings} />
      </details>
    );
  }
  return (
    <section className="rr-disc-deployment-group">
      <header>{heading}</header>
      <FindingRows findings={findings} />
    </section>
  );
}

export function DiscDegenerativeFindingsPanel({ findings, contractError, unavailableReason }: Props) {
  const groups = new Map(groupDiscFindingsByLevel(findings).map((group) => [group.level, group.findings]));
  return (
    <section className="rr-disc-findings" aria-label="Hallazgos discales P10.7">
      <p className="rr-section-title">Hallazgos discales P10.7</p>
      <p className="rr-findings-notice">{DISC_FINDINGS_NOTICE}</p>

      {contractError && (
        <p className="rr-disc-contract-error" role="alert">
          No se muestran resultados P10.7: {contractError}
        </p>
      )}
      {!contractError && !findings.length && (
        <p className="rr-findings-empty">
          {unavailableReason ?? "Esta corrida no tiene hallazgos P10.7 persistidos."}
        </p>
      )}

      {!contractError && findings.length > 0 && (
        <>
          <p className="rr-findings-warning">
            La localización automática funcionó técnicamente sobre un estudio real, pero su precisión clínica y general todavía no está validada.
          </p>
          {DISC_LEVELS.map((level) => {
            const levelFindings = groups.get(level) ?? [];
            return (
              <section className="rr-disc-level" key={level}>
                <h4>{level}</h4>
                {!levelFindings.length && <p className="rr-findings-empty">Sin findings informados para este nivel.</p>}
                {DEPLOYMENT_ORDER.map((status) => (
                  <DeploymentGroup
                    findings={levelFindings.filter((finding) => finding.deploymentStatus === status)}
                    key={status}
                    status={status}
                  />
                ))}
              </section>
            );
          })}
          <p className="rr-findings-foot">
            La revisión se registra sobre la corrida completa. El contrato actual no permite editar cada finding P10.7 por separado.
          </p>
        </>
      )}
    </section>
  );
}
