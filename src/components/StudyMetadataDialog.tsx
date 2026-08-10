import { displayReviewPriority } from "../clinicalDisplay";
import type { StudyMetadataDraft } from "../studyMetadata";

interface StudyMetadataDialogProps {
  currentSubjectRef: string;
  draft: StudyMetadataDraft;
  error: string;
  saving: boolean;
  subjectRefLocked: boolean;
  onCancel: () => void;
  onDraftChange: (draft: StudyMetadataDraft) => void;
  onErrorClear: () => void;
  onSave: () => void;
  onSubjectRefBlur: () => void;
}

export function StudyMetadataDialog({
  currentSubjectRef,
  draft,
  error,
  saving,
  subjectRefLocked,
  onCancel,
  onDraftChange,
  onErrorClear,
  onSave,
  onSubjectRefBlur,
}: StudyMetadataDialogProps) {
  return (
    <div className="rr-dialog-backdrop" role="presentation">
      <section className="rr-dialog" role="dialog" aria-modal="true" aria-labelledby="metadata-dialog-title">
        <h2 id="metadata-dialog-title">Editar datos del estudio</h2>
        <div className="rr-dialog-grid">
          <label className="rr-field rr-span-all">
            <span>Referencia de paciente de-identificada</span>
            <input
              value={subjectRefLocked ? currentSubjectRef : draft.subjectRef}
              readOnly={subjectRefLocked}
              onBlur={onSubjectRefBlur}
              onChange={(event) => {
                if (subjectRefLocked) return;
                onDraftChange({ ...draft, subjectRef: event.target.value });
                onErrorClear();
              }}
              placeholder="SPIDER-101"
              aria-invalid={Boolean(error)}
            />
          </label>
          {subjectRefLocked && <p className="rr-note rr-span-all">La referencia de-identificada ya fue asignada y no puede reemplazarse. Esto evita vincular estudios de personas distintas.</p>}
          <label className="rr-field">
            <span>Fecha del estudio</span>
            <input type="date" value={draft.studyDate} onChange={(event) => onDraftChange({ ...draft, studyDate: event.target.value })} />
          </label>
          <label className="rr-field">
            <span>Modalidad</span>
            <select value={draft.modality} onChange={(event) => onDraftChange({ ...draft, modality: event.target.value })}>
              <option value="">No informada</option>
              <option value="MRI">Resonancia magnética</option>
            </select>
          </label>
          <label className="rr-field">
            <span>Prioridad</span>
            <select value={draft.reviewPriority} onChange={(event) => onDraftChange({ ...draft, reviewPriority: event.target.value as StudyMetadataDraft["reviewPriority"] })}>
              <option value="low">{displayReviewPriority("low")}</option>
              <option value="medium">{displayReviewPriority("medium")}</option>
              <option value="high">{displayReviewPriority("high")}</option>
            </select>
          </label>
          <label className="rr-field rr-span-all">
            <span>Descripción</span>
            <input maxLength={200} value={draft.description} onChange={(event) => onDraftChange({ ...draft, description: event.target.value })} placeholder="RM lumbar sagital T2" />
          </label>
        </div>
        <p className="rr-note">No ingreses nombre, DNI, correo, teléfono, domicilio ni historia clínica real.</p>
        {error && <p className="rr-error" role="alert">{error}</p>}
        <div className="rr-actions">
          <button className="rr-ghost rr-secondary" onClick={onCancel} disabled={saving} type="button">Cancelar</button>
          <button className="rr-primary" onClick={onSave} disabled={saving} type="button">{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </section>
    </div>
  );
}
