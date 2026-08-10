import {
  DISC_FINDING_TYPES,
  DISC_LEVELS,
  groupDiscFindingsByLevel,
  type DeploymentStatus,
  type DiscFinding,
  type DiscFindingType,
} from "./discDegenerativeFindings";
import {
  DEPLOYMENT_LABELS,
  DEPLOYMENT_ORDER,
  DISC_FINDING_LABELS,
  displayDiscFindingValue,
} from "./discFindingDisplay";

type Props = {
  findings: DiscFinding[];
  contractError?: string;
  unavailableReason?: string;
};

type HomogeneousStatus = DeploymentStatus | "mixed";

function statusByFindingType(findings: DiscFinding[]): Map<DiscFindingType, HomogeneousStatus> {
  const result = new Map<DiscFindingType, HomogeneousStatus>();
  for (const type of DISC_FINDING_TYPES) {
    const statuses = new Set(
      findings.filter((finding) => finding.findingType === type).map((finding) => finding.deploymentStatus),
    );
    if (statuses.size === 1) result.set(type, [...statuses][0]);
    else if (statuses.size > 1) result.set(type, "mixed");
  }
  return result;
}

function compactDiscSummary(findings: DiscFinding[]): string {
  const discFindings = findings.filter((finding) => finding.findingType !== "pfirrmann_grade");
  if (!discFindings.length) return "Sin datos";
  const positives = discFindings.filter((finding) => finding.label !== "absent" && finding.label !== "none").length;
  if (!positives) return "Sin positivos";
  return positives === 1 ? "1 positivo" : `${positives} positivos`;
}

function FindingRows({
  findings,
  homogeneousStatuses,
}: {
  findings: DiscFinding[];
  homogeneousStatuses: Map<DiscFindingType, HomogeneousStatus>;
}) {
  return (
    <div className="rr-disc-finding-rows">
      {findings.map((finding) => (
        <article className="rr-disc-finding" key={finding.findingId}>
          <span>{DISC_FINDING_LABELS[finding.findingType]}</span>
          <span className="rr-disc-finding-result">
            {homogeneousStatuses.get(finding.findingType) === "mixed" && (
              <span className={`rr-disc-deployment is-${finding.deploymentStatus}`}>
                {DEPLOYMENT_LABELS[finding.deploymentStatus]}
              </span>
            )}
            <strong>{displayDiscFindingValue(finding.label)}</strong>
          </span>
        </article>
      ))}
    </div>
  );
}

export function DiscDegenerativeFindingsPanel({ findings, contractError, unavailableReason }: Props) {
  const groups = new Map(groupDiscFindingsByLevel(findings).map((group) => [group.level, group.findings]));
  const homogeneousStatuses = statusByFindingType(findings);
  const researchFindings = findings.filter((finding) => finding.deploymentStatus === "not_product_supported");
  const homogeneousClinicalTypes = DISC_FINDING_TYPES.filter((type) => {
    const status = homogeneousStatuses.get(type);
    return status && status !== "mixed" && status !== "not_product_supported";
  });

  return (
    <section className="rr-disc-findings" aria-label="Hallazgos discales P10.7">
      <div className="rr-disc-section-head">
        <p className="rr-section-title">Hallazgos discales P10.7</p>
      </div>

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
          <div className="rr-disc-status-groups" aria-label="Estados de validación por tipo de hallazgo">
            {DEPLOYMENT_ORDER.filter((status) => status !== "not_product_supported").map((status) => {
              const types = homogeneousClinicalTypes.filter((type) => homogeneousStatuses.get(type) === status);
              if (!types.length) return null;
              return (
                <div className="rr-disc-status-group" key={status}>
                  <span className={`rr-disc-deployment is-${status}`}>{DEPLOYMENT_LABELS[status]}</span>
                  <span>{types.map((type) => DISC_FINDING_LABELS[type]).join(" · ")}</span>
                </div>
              );
            })}
          </div>

          <div className="rr-disc-overview" role="group" aria-label="Resumen P10.7 por nivel">
            <div className="rr-disc-overview-head" aria-hidden="true">
              <span>Nivel</span>
              <span>Disco</span>
              <span>Pfirrmann</span>
            </div>
            {DISC_LEVELS.map((level) => {
              const levelFindings = (groups.get(level) ?? []).filter(
                (finding) => finding.deploymentStatus !== "not_product_supported",
              );
              const pfirrmann = levelFindings.find((finding) => finding.findingType === "pfirrmann_grade");
              return (
                <details className="rr-disc-level" key={level}>
                  <summary className="rr-disc-level-summary">
                    <strong>{level}</strong>
                    <span>{compactDiscSummary(levelFindings)}</span>
                    <span>{pfirrmann ? displayDiscFindingValue(pfirrmann.label) : "—"}</span>
                  </summary>
                  {levelFindings.length ? (
                    <FindingRows findings={levelFindings} homogeneousStatuses={homogeneousStatuses} />
                  ) : (
                    <p className="rr-findings-empty">Sin findings informados para este nivel.</p>
                  )}
                </details>
              );
            })}
          </div>

          {researchFindings.length > 0 && (
            <details className="rr-disc-research">
              <summary>
                <span>Resultados de investigación</span>
                <span className="rr-disc-research-count">{researchFindings.length}</span>
              </summary>
              <p className="rr-disc-research-note">
                No son una capacidad soportada para producto. Se conservan para análisis y trazabilidad.
              </p>
              {DISC_LEVELS.map((level) => {
                const levelFindings = researchFindings.filter((finding) => finding.level === level);
                if (!levelFindings.length) return null;
                return (
                  <section className="rr-disc-research-level" key={level}>
                    <h4>{level}</h4>
                    <FindingRows findings={levelFindings} homogeneousStatuses={homogeneousStatuses} />
                  </section>
                );
              })}
            </details>
          )}

          <p className="rr-findings-foot">
            La revisión se registra sobre la corrida completa. El contrato actual no permite editar cada finding P10.7 por separado.
          </p>
        </>
      )}
    </section>
  );
}
