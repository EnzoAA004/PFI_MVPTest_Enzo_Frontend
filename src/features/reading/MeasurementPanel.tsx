import { displayMeasurementLabel, displayMeasurementLabelShort, displayUnit } from "../../clinicalDisplay";
import type { MeasurementGroup } from "./measurementGrouping";
import { checkRange, rangeBadge } from "./referenceRanges";

/**
 * Las mediciones del nivel que se está leyendo.
 *
 * Antes había dos listas en pestañas distintas: una que mostraba los valores del
 * nivel, y otra —dentro de "Revisión"— con las cuarenta y tres mediciones de la
 * corrida y un campo de texto por cada una, sin nivel y sin imagen. El médico medía
 * en una pantalla y corregía en otra, y la lista de corrección no tenía forma de
 * decir a qué parte de la anatomía correspondía cada renglón.
 *
 * Acá son una sola cosa: la fila muestra el valor, deja corregirlo en el lugar,
 * resalta su cota en la imagen al pasar el mouse y la selecciona al tocarla.
 *
 * Una medición de la IA no se borra, se corrige: su valor original queda al lado del
 * corregido, porque lo que la IA propuso es parte del registro de la revisión. Las
 * del revisor sí se borran, porque son suyas.
 */

export type PanelRow = {
  id: string;
  /** Identificador canónico, el que decide contra qué rango se compara. */
  labelKey: string;
  label: string;
  level?: string | null;
  levelScope?: string | null;
  unit: string;
  aiValue?: number | string;
  reviewerValue?: number | string | null;
  /** Si tiene figura dibujada sobre la imagen y por lo tanto se puede seleccionar. */
  measurable: boolean;
  source: "ai" | "reviewer";
  detail?: string;
};

type SharedProps = Omit<Props, "rows" | "emptyNote">;

type Props = {
  rows: PanelRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHighlight: (id: string | null) => void;
  onChangeValue: (row: PanelRow, value: string) => void;
  onDelete: (id: string) => void;
  readonly: boolean;
  /** Por qué no hay filas: no es lo mismo un nivel sin medir que un plano que no mide. */
  emptyNote?: string;
};

function asNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function MeasurementPanel({
  rows, selectedId, onSelect, onHighlight, onChangeValue, onDelete, readonly, emptyNote,
}: Props) {
  if (!rows.length) return <p className="rr-note">{emptyNote ?? "Sin mediciones en este nivel."}</p>;

  return (
    <div className="rr-measures">
      {rows.map((row) => {
        const ai = asNumber(row.aiValue);
        const reviewer = asNumber(row.reviewerValue);
        const shown = reviewer ?? ai;
        const edited = reviewer !== null && ai !== null && reviewer !== ai;
        const verdict = shown === null ? null : checkRange(row.labelKey, shown, row.unit);
        return (
          // Solo las filas medibles se seleccionan, y las que se seleccionan tienen que
          // comportarse como boton: foco por tabulacion y activacion con Enter o Espacio.
          // El resaltado por mouse es un extra que el teclado no necesita replicar.
          <div
            aria-pressed={row.measurable ? selectedId === row.id : undefined}
            className={`rr-measure${row.measurable ? " is-measurable" : ""}${selectedId === row.id ? " is-selected" : ""}${edited ? " rr-measure-edited" : ""}`}
            key={row.id}
            onClick={row.measurable ? () => onSelect(selectedId === row.id ? null : row.id) : undefined}
            onKeyDown={
              row.measurable
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      // Espacio scrollea la pagina si no se lo frena.
                      event.preventDefault();
                      onSelect(selectedId === row.id ? null : row.id);
                    }
                  }
                : undefined
            }
            onMouseEnter={() => onHighlight(row.id)}
            onMouseLeave={() => onHighlight(null)}
            role={row.measurable ? "button" : undefined}
            tabIndex={row.measurable ? 0 : undefined}
          >
            <div className="rr-measure-main">
              <span className="rr-measure-label" title={displayMeasurementLabel(row.label)}>
                {displayMeasurementLabelShort(row.label)}
              </span>
              {row.source === "reviewer" && <span className="rr-measure-source">mía</span>}
              {/*
                El valor de una medición propia sale de la figura y no se teclea: se
                corrige moviendo sus extremos sobre la imagen. El campo se muestra de
                solo lectura y lo dice, en vez de aceptar lo que se escriba y
                descartarlo en silencio, que es lo que hacía antes.
              */}
              <input
                aria-label={`Valor de ${displayMeasurementLabel(row.label)}`}
                className="rr-measure-input"
                disabled={readonly}
                inputMode="decimal"
                onChange={(event) => onChangeValue(row, event.target.value)}
                onClick={(event) => event.stopPropagation()}
                placeholder={ai === null ? "" : String(ai)}
                readOnly={row.source === "reviewer"}
                title={row.source === "reviewer" ? "Se ajusta moviendo los extremos sobre la imagen." : undefined}
                value={row.reviewerValue === null || row.reviewerValue === undefined ? "" : String(row.reviewerValue)}
              />
              <span className="rr-measure-unit">{displayUnit(row.unit)}</span>
              {row.source === "reviewer" && !readonly && (
                <button
                  aria-label={`Borrar ${displayMeasurementLabel(row.label)}`}
                  className="rr-measure-delete"
                  onClick={(event) => { event.stopPropagation(); onDelete(row.id); }}
                  title="Borrar esta medición"
                  type="button"
                >
                  ×
                </button>
              )}
            </div>

            <div className="rr-measure-foot">
              {/*
                El valor de la IA queda visible cuando el revisor lo corrigió: lo que
                el modelo propuso es parte del registro de la revisión, no algo que se
                reemplaza y desaparece.
              */}
              {edited && ai !== null && (
                <span className="rr-measure-ai">IA {ai} {displayUnit(row.unit)}</span>
              )}
              {row.detail && <span className="rr-measure-detail">{row.detail}</span>}
              {verdict && (
                <span
                  className={`rr-range rr-range-${verdict.status}`}
                  title={`${verdict.text}. ${verdict.range.assumes ? `Asume ${verdict.range.assumes}. ` : ""}${verdict.range.source}`}
                >
                  {rangeBadge(verdict)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type GroupListProps = SharedProps & {
  groups: MeasurementGroup<PanelRow>[];
  collapsible?: boolean;
  emptyNote?: string;
};

/** Presentación anatómica; las filas y sus callbacks siguen siendo los originales. */
export function MeasurementGroupList({ groups, collapsible = false, emptyNote, ...panelProps }: GroupListProps) {
  if (!groups.length) return <p className="rr-note">{emptyNote ?? "Sin mediciones para mostrar."}</p>;

  return (
    <div className="rr-measure-groups">
      {groups.map((group) => collapsible ? (
        <details className="rr-measure-group" key={group.category}>
          <summary>
            <span>{group.label}</span>
            <span className="rr-measure-group-count">{group.rows.length}</span>
          </summary>
          <MeasurementPanel {...panelProps} rows={group.rows} />
        </details>
      ) : (
        <section aria-labelledby={`measurement-group-${group.category}`} className="rr-measure-group is-expanded" key={group.category}>
          <h4 id={`measurement-group-${group.category}`}>
            <span>{group.label}</span>
            <span className="rr-measure-group-count">{group.rows.length}</span>
          </h4>
          <MeasurementPanel {...panelProps} rows={group.rows} />
        </section>
      ))}
    </div>
  );
}
