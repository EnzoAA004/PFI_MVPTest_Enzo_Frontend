interface OnboardingTutorialProps {
  onComplete: () => void;
  saving?: boolean;
}

const steps = [
  {
    title: "1. Worklist de estudios",
    detail: "Revisá casos de-identificados, prioridad, estado del modelo y estado de revisión profesional.",
  },
  {
    title: "2. Workspace de revisión",
    detail: "Abrí un estudio para ver series, slices, overlays, máscaras, landmarks y resultados IA vs Reviewer.",
  },
  {
    title: "3. Guardado y trazabilidad",
    detail: "Los cambios de medidas se guardan solo al confirmar. El backend registra auditoría de accesos y acciones.",
  },
  {
    title: "4. Alcance académico",
    detail: "La herramienta es asistiva, requiere revisión profesional y no constituye diagnóstico clínico.",
  },
];

export function OnboardingTutorial({ onComplete, saving }: OnboardingTutorialProps) {
  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="Tutorial inicial">
      <section className="onboarding-card">
        <div className="auth-brand">
          <div className="brand-mark">LM</div>
          <div>
            <strong>Primer ingreso profesional</strong>
            <span>Guía breve de uso para la plataforma de RM lumbar.</span>
          </div>
        </div>
        <div className="auth-copy">
          <p>Mini tutorial</p>
          <h1>Cómo usar la herramienta</h1>
          <span>Este recorrido aparece solo la primera vez para cada profesional aprobado.</span>
        </div>
        <div className="onboarding-steps">
          {steps.map((step) => (
            <article key={step.title}>
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
        <div className="verification-panel">
          <strong>Recordatorio</strong>
          <p>Trabajá únicamente con datos de-identificados y usá la salida del modelo como apoyo revisable.</p>
        </div>
        <button className="primary-button" disabled={saving} onClick={onComplete} type="button">
          {saving ? "Guardando..." : "Entendido, comenzar"}
        </button>
      </section>
    </div>
  );
}
