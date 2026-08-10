import {
  DEPLOYMENT_LABELS,
  DEPLOYMENT_NOTES,
  DEPLOYMENT_ORDER,
  DISC_FINDINGS_NOTICE,
} from "./discFindingDisplay";

type Props = {
  discLocalizationAvailable: boolean;
};

/**
 * Un solo punto de entrada para el alcance de los resultados IA del inspector.
 * `details` conserva la explicación completa sin repetirla por nivel y es operable
 * con click, mouse y teclado sin depender de hover.
 */
export function GovernanceNotice({ discLocalizationAvailable }: Props) {
  return (
    <section className="rr-ai-governance" aria-labelledby="rr-ai-governance-title">
      <div className="rr-ai-governance-head">
        <h3 id="rr-ai-governance-title">Resultados asistidos por IA</h3>
        <span aria-hidden="true" className="rr-ai-governance-mark">IA</span>
      </div>
      <p>Requieren revisión profesional. El grado de validación depende del tipo de hallazgo.</p>

      <details className="rr-ai-governance-details">
        <summary>Información sobre validación y alcance</summary>
        <div className="rr-ai-governance-content">
          <p>{DISC_FINDINGS_NOTICE}</p>
          <dl>
            {DEPLOYMENT_ORDER.map((status) => (
              <div key={status}>
                <dt>
                  <span className={`rr-disc-deployment is-${status}`}>{DEPLOYMENT_LABELS[status]}</span>
                </dt>
                <dd>{DEPLOYMENT_NOTES[status]}</dd>
              </div>
            ))}
          </dl>
          {discLocalizationAvailable && (
            <p className="rr-findings-warning">
              La localización automática se ejecutó técnicamente sobre este estudio real. Esto no implica que su precisión clínica o general esté validada.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
