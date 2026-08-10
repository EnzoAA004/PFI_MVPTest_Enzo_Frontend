/**
 * Recordatorio global y compacto del alcance de la asistencia por IA.
 *
 * El elemento nativo `details` mantiene la explicación disponible mediante click,
 * foco y teclado sin ocupar permanentemente el área de lectura.
 */
export function WorkspaceGovernanceNotice() {
  return (
    <details className="rr-workspace-governance">
      <summary>
        <span>IA asistida · Revisión profesional requerida</span>
        <span aria-hidden="true">ⓘ</span>
      </summary>
      <p>
        Los resultados generados por IA deben ser revisados por un profesional y no
        constituyen un diagnóstico autónomo. El alcance y nivel de evaluación varía
        según cada capacidad.
      </p>
    </details>
  );
}
