import { useEffect, useMemo, useState } from "react";
import { getPipelineContractSchema, type PipelineContractSchema } from "../pipelineContractApi";
import { StatusBadge } from "./StatusBadge";

const importantRootFields = ["series", "masks", "landmarks", "measurementValues", "aiOutput", "modelArtifact", "quality", "metadata", "review"];

function boolText(value?: boolean) {
  if (value === undefined) return "sin datos";
  return value ? "sí" : "no";
}

export function PipelineContractCard() {
  const [schema, setSchema] = useState<PipelineContractSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setSchema(await getPipelineContractSchema());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo consultar el contrato del pipeline");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const visibleFields = useMemo(() => {
    const rootFields = schema?.rootFields ?? {};
    return importantRootFields.filter((key) => key in rootFields).map((key) => [key, rootFields[key]] as const);
  }, [schema]);

  return (
    <section className="panel-card compact-card pipeline-contract-card">
      <div className="section-title">
        <div>
          <h2>Contrato técnico del pipeline</h2>
          <p className="muted compact-copy">Estructura estable que conecta AI Module, backend y frontend.</p>
        </div>
        <StatusBadge tone={schema?.status === "stable" ? "green" : error ? "amber" : "blue"}>{schema?.status ?? (loading ? "consultando" : "sin datos")}</StatusBadge>
      </div>

      {error && <div className="panel-hidden-placeholder">{error}</div>}

      <dl className="info-list compact-info">
        <div><dt>Schema</dt><dd>{schema?.schemaVersion ?? "sin datos"}</dd></div>
        <div><dt>Proxy backend</dt><dd>{boolText(schema?.proxiedByBackend)}</dd></div>
        <div><dt>Revisión humana</dt><dd>{boolText(schema?.humanReviewRequired)}</dd></div>
        <div><dt>No diagnóstico</dt><dd>{boolText(schema?.notClinicalDiagnosis)}</dd></div>
      </dl>

      {schema?.purpose && <p className="muted compact-copy">{schema.purpose}</p>}

      {visibleFields.length > 0 && (
        <div className="comparison-table unified-results-table ai-artifact-table">
          <div className="comparison-head"><span>Campo</span><span>Descripción</span></div>
          {visibleFields.map(([key, description]) => (
            <div className="comparison-row compact-comparison-row" key={key}>
              <span><strong>{key}</strong></span>
              <span>{description}</span>
            </div>
          ))}
        </div>
      )}

      {schema?.guarantees?.length ? (
        <ul className="check-list compact-copy">
          {schema.guarantees.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}

      <div className="review-actions compact-actions">
        <button className="ghost-button" disabled={loading} onClick={() => void refresh()} type="button">Actualizar contrato</button>
      </div>
    </section>
  );
}
