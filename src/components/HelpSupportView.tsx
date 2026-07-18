import { HelpCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

export function HelpSupportView() {
  return (
    <div className="view-stack help-support-view">
      <section className="page-heading compact-heading">
        <div>
          <p>Ayuda y soporte</p>
          <h1>Ayuda, privacidad y alcance de uso</h1>
        </div>
        <div className="screen-summary">
          <strong>Soporte</strong>
          <span>Información estática de la app</span>
        </div>
      </section>

      <section className="help-grid">
        <article className="panel-card compact-card help-card">
          <div className="section-title"><h2><ShieldCheck aria-hidden size={18} /> Alcance de la plataforma</h2></div>
          <ul className="check-list clean-list">
            <li>Uso académico y de investigación sobre datos de-identificados.</li>
            <li>La salida del modelo es asistiva y requiere revisión humana profesional.</li>
            <li>No constituye diagnóstico clínico autónomo.</li>
            <li>Las capacidades futuras se muestran como pendientes cuando no existe soporte backend.</li>
          </ul>
        </article>

        <article className="panel-card compact-card help-card">
          <div className="section-title"><h2><LockKeyhole aria-hidden size={18} /> Privacidad y gobernanza</h2></div>
          <ul className="check-list clean-list">
            <li>La interfaz trabaja con referencias de-identificadas como PAT-xxxx y CASE-xxxx.</li>
            <li>El criterio de privacidad documentado para este MVP es HIPAA Safe Harbor aplicado a datos de-identificados.</li>
            <li>No se deben ingresar identificadores directos del paciente en notas, nombres de archivos o comentarios.</li>
            <li>Los detalles técnicos de inferencia, readiness y contratos pertenecen al soporte técnico, no a las pantallas clínicas principales.</li>
          </ul>
        </article>

        <article className="panel-card compact-card help-card">
          <div className="section-title"><h2>Exportación y uso compartido</h2></div>
          <ul className="check-list clean-list">
            <li>Los reportes exportables no deben incluir identificadores directos ni imágenes crudas si el flujo no lo permite explícitamente.</li>
            <li>Los resúmenes derivados son para revisión académica y trazabilidad interna del MVP.</li>
            <li>Antes de compartir resultados, verificar alcance, de-identificación y aprobación profesional.</li>
          </ul>
        </article>

        <article className="panel-card compact-card help-card">
          <div className="section-title"><h2><HelpCircle aria-hidden size={18} /> Cómo usar la app</h2></div>
          <ol className="support-steps">
            <li>Entrar con una cuenta profesional aprobada.</li>
            <li>Ir a Estudios o Cola de revisión y abrir un caso disponible.</li>
            <li>Revisar imágenes, overlays reales, mediciones y notas del caso.</li>
            <li>Guardar borrador o completar la revisión según corresponda.</li>
          </ol>
        </article>

        <article className="panel-card compact-card help-card">
          <div className="section-title"><h2><Mail aria-hidden size={18} /> Contacto</h2></div>
          <p className="muted compact-copy">Para soporte del MVP, reportar el caso, pantalla y acción que produjo el problema al equipo responsable del proyecto PFI.</p>
          <p className="settings-persistence-note">No hay sistema de tickets integrado en el frontend actual.</p>
        </article>
      </section>
    </div>
  );
}
