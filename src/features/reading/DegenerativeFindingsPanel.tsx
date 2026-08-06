import { FINDING_LEVELS, sortFindings, type DegenerativeFinding, type FindingSide, type Severity } from "./degenerativeFindings";
import type { SubarticularRoiDraft } from "./subarticularRoi";

/**
 * Hallazgos degenerativos candidatos, por nivel y por lado.
 *
 * Es una clasificación asistida, no un diagnóstico, y la pantalla tiene que sostenerlo
 * en el vocabulario y no solo en un descargo al pie: "hallazgo candidato",
 * "probabilidad estimada por el modelo", "para revisión". Nunca "lesión detectada".
 *
 * Se muestran las tres probabilidades y no solo la clase ganadora. Un 0.72 / 0.20 / 0.08
 * y un 0.40 / 0.38 / 0.22 dan la misma etiqueta y no se leen igual: el segundo es un
 * caso donde el modelo está prácticamente indeciso, y esconder eso detrás de la etiqueta
 * le saca al revisor justo el dato que le dice cuánto mirar.
 */

const SEVERITY_TEXT: Record<Severity, string> = {
  normal_mild: "Normal / leve",
  moderate: "Moderada",
  severe: "Severa",
};

const SIDE_TEXT: Record<FindingSide, string> = {
  left: "Izquierdo",
  right: "Derecho",
};

const REVIEW_TEXT: Record<DegenerativeFinding["reviewStatus"], string> = {
  pending: "Pendiente de revisión",
  accepted: "Aceptado por el revisor",
  rejected: "Descartado por el revisor",
  edited: "Corregido por el revisor",
};

export type DegenerativeFindingsPanelProps = {
  findings: DegenerativeFinding[];
  /** Motivo por el que todavía no se puede pedir una clasificación nueva, si lo hay. */
  requestBlockedReason?: string;
  selectedFindingId?: string | null;
  onSelectFinding?: (findingId: string) => void;
  /** Estado del marcado de un receso, si hay uno en curso. */
  roi?: SubarticularRoiPanelState;
};

export type SubarticularRoiPanelState = {
  /** El modo de marcado está activo. */
  active: boolean;
  /** Solo se puede marcar sobre un corte axial. */
  available: boolean;
  onToggle: () => void;
  /** El punto ya marcado, o null si todavía no se marcó ninguno. */
  draft: SubarticularRoiDraft | null;
  /** Lo que falta para poder pedir la clasificación, o null si está listo. */
  missingReason: string | null;
  onChangeSide: (side: FindingSide) => void;
  onChangeLevel: (level: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
  error?: string;
};

function percent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * Marcado del receso y confirmación de lo que se va a pedir.
 *
 * El lado y el nivel se derivan del DICOM —de la orientación del corte y del nivel que la
 * corrida le asignó— y se muestran para que el profesional los confirme o los corrija
 * antes de mandar nada. Es la convención de los PACS: no se le pide que tipee lo que la
 * serie ya sabe, y no se manda nada que no haya visto.
 *
 * Cuando alguno no se puede derivar no se elige uno por defecto. Un receso clasificado
 * por el lado equivocado, o bajo el nivel de al lado, se lee igual de convincente que uno
 * correcto.
 */
function SubarticularRoiSection({ roi }: { roi: SubarticularRoiPanelState }) {
  const { draft } = roi;
  return (
    <div className="rr-roi">
      <div className="rr-roi-head">
        <button
          className={`rr-roi-toggle${roi.active ? " is-active" : ""}`}
          disabled={!roi.available || roi.pending}
          onClick={roi.onToggle}
          title={roi.available ? "Marcar el receso subarticular sobre el corte axial" : "Solo se puede marcar sobre un corte axial"}
          type="button"
        >
          {roi.active ? "Cancelar marcado" : "Marcar receso subarticular"}
        </button>
      </div>

      {roi.active && !draft && (
        <p className="rr-roi-hint">Hacé clic sobre el receso subarticular en el corte axial.</p>
      )}

      {draft && (
        <div className="rr-roi-draft">
          <dl className="rr-roi-fields">
            <div>
              <dt>Corte</dt>
              <dd>{draft.instanceNumber}</dd>
            </div>
            <div>
              <dt>Punto</dt>
              <dd>{Math.round(draft.x)}, {Math.round(draft.y)} px</dd>
            </div>
          </dl>

          <fieldset className="rr-roi-choice">
            <legend>Lado{draft.side === null ? " (no se pudo deducir)" : ""}</legend>
            {(["left", "right"] as FindingSide[]).map((side) => (
              <label key={side}>
                <input
                  checked={draft.side === side}
                  disabled={roi.pending}
                  name="rr-roi-side"
                  onChange={() => roi.onChangeSide(side)}
                  type="radio"
                />
                {SIDE_TEXT[side]}
              </label>
            ))}
          </fieldset>

          <label className="rr-roi-choice">
            <span>Nivel{draft.level === null ? " (el corte no cae en un disco)" : ""}</span>
            <select
              disabled={roi.pending}
              onChange={(event) => roi.onChangeLevel(event.target.value)}
              value={draft.level ?? ""}
            >
              <option disabled value="">Elegir nivel</option>
              {FINDING_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>

          {roi.missingReason && <p className="rr-roi-missing">{roi.missingReason}</p>}
          {roi.error && <p className="rr-roi-error">{roi.error}</p>}

          <div className="rr-roi-actions">
            <button disabled={roi.pending} onClick={roi.onCancel} type="button">Descartar</button>
            <button
              className="rr-roi-submit"
              disabled={roi.pending || roi.missingReason !== null}
              onClick={roi.onSubmit}
              type="button"
            >
              {roi.pending ? "Clasificando…" : "Pedir clasificación"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DegenerativeFindingsPanel({
  findings, requestBlockedReason, selectedFindingId, onSelectFinding, roi,
}: DegenerativeFindingsPanelProps) {
  const ordered = sortFindings(findings);
  const externalCount = ordered.filter((item) => item.externalCoordinate).length;

  return (
    <section className="rr-findings">
      <p className="rr-section-title">Hallazgos degenerativos candidatos</p>

      {/*
        El aviso va arriba y siempre, no al pie y solo cuando hay hallazgos. Es la
        condición bajo la cual se lee todo lo de abajo: sin él, una etiqueta "Severa"
        junto a una imagen del paciente se lee como una conclusión del sistema.
      */}
      <p className="rr-findings-notice">
        Clasificación asistida para revisión profesional. No constituye diagnóstico ni
        indica conducta.
      </p>

      {externalCount > 0 && (
        <p className="rr-findings-warning">
          {externalCount === 1 ? "La coordenada anatómica fue provista" : "Las coordenadas anatómicas fueron provistas"} externamente:
          no existe un localizador automático validado, así que el resultado depende de
          dónde se marcó el punto.
        </p>
      )}

      {roi && <SubarticularRoiSection roi={roi} />}

      {!ordered.length && (
        <p className="rr-findings-empty">
          {requestBlockedReason
            ? requestBlockedReason
            : roi?.available
              ? "Esta corrida no informa hallazgos degenerativos. Marcá el receso subarticular sobre el corte axial para pedir una clasificación."
              : "Esta corrida no informa hallazgos degenerativos. Para pedir una clasificación hay que estar sobre un corte axial."}
        </p>
      )}

      {ordered.map((finding) => {
        const selected = finding.findingId === selectedFindingId;
        // La tarjeta entera es el area de seleccion, asi que tiene que comportarse como
        // un boton: foco por tabulacion y activacion con Enter o Espacio. Sin esto un
        // revisor que no usa mouse no puede llegar a ningun hallazgo.
        // Cuando no hay handler no es interactiva, y entonces conserva su rol de article.
        const interactive = Boolean(onSelectFinding);
        const select = () => onSelectFinding?.(finding.findingId);
        const body = (
          <>
            <header>
              <span className="rr-finding-anatomy">
                {finding.level} · {SIDE_TEXT[finding.side]}
              </span>
              <span className={`rr-finding-label is-${finding.label}`}>
                {SEVERITY_TEXT[finding.label]}
              </span>
            </header>

            {/*
              Las tres barras, no solo la ganadora. La distancia entre la primera y la
              segunda es lo que le dice al revisor si el modelo está decidido o al borde.
            */}
            <dl className="rr-finding-probs">
              {(Object.keys(SEVERITY_TEXT) as Severity[]).map((label) => (
                <div key={label}>
                  <dt>{SEVERITY_TEXT[label]}</dt>
                  <dd>
                    <span className="rr-prob-bar" style={{ inlineSize: `${finding.probabilities[label] * 100}%` }} />
                    <span className="rr-prob-value">{percent(finding.probabilities[label])}</span>
                  </dd>
                </div>
              ))}
            </dl>

            <footer>
              <span className={`rr-finding-review is-${finding.reviewStatus}`}>
                {REVIEW_TEXT[finding.reviewStatus]}
              </span>
              {finding.slicePosition !== null && <span>Corte {finding.slicePosition}</span>}
              {finding.researchOnly && <span className="rr-finding-scope">Solo investigación</span>}
            </footer>
          </>
        );

        const className = `rr-finding${selected ? " is-selected" : ""}`;

        if (!interactive) {
          return (
            <article aria-current={selected || undefined} className={className} key={finding.findingId}>
              {body}
            </article>
          );
        }

        return (
          <div
            aria-current={selected || undefined}
            className={className}
            key={finding.findingId}
            onClick={select}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                // Espacio scrollea la pagina si no se lo frena.
                event.preventDefault();
                select();
              }
            }}
            role="button"
            tabIndex={0}
          >
            {body}
          </div>
        );
      })}

      {Boolean(ordered.length) && (
        <p className="rr-findings-foot">
          Probabilidades estimadas por el modelo{ordered[0].modelId ? ` ${ordered[0].modelId}` : ""}.
          Los niveles evaluados son {FINDING_LEVELS.join(", ")}.
        </p>
      )}
    </section>
  );
}
