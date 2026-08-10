export type WorkspaceSeriesOption = {
  id: string;
  label: string;
  role: "analyzed" | "reference";
};

type Props = {
  options: WorkspaceSeriesOption[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const ROLE_LABELS: Record<WorkspaceSeriesOption["role"], string> = {
  analyzed: "Analizada IA",
  reference: "Referencia",
};

/** Selector compacto de la vista activa; no afirma capacidades para series de referencia. */
export function SeriesSelector({ options, selectedId, onSelect }: Props) {
  const selected = options.find((option) => option.id === selectedId) ?? options[0];
  return (
    <label className="rr-workspace-series">
      <span className="rr-workspace-series-label">Vista</span>
      <select aria-label="Serie o plano activo" onChange={(event) => onSelect(event.target.value)} value={selected?.id ?? ""}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      {selected && <span className={`rr-series-role is-${selected.role}`}>{ROLE_LABELS[selected.role]}</span>}
    </label>
  );
}
