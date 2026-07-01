type ReviewStatus = "pendiente" | "aceptado" | "observado" | "descartado";
type Priority = "alta" | "media" | "baja";
type PatientStudy = { caseId: string; studyDate: string; planes: string; modelVersion: string; reviewStatus: ReviewStatus; priority: Priority; metrics: { lordosisAngle: number; canalDiameter: number; averageDiscHeight: number; l45DiscHeight: number } };

import { PrivacyBanner } from "./PrivacyBanner";
import { PriorityBadge, ReviewBadge, StatusBadge } from "./StatusBadge";

interface PatientHistoryViewProps { studies: PatientStudy[]; }

function TrendChart({ studies, metric }: { studies: PatientStudy[]; metric: keyof PatientStudy["metrics"] }) {
  const values = studies.map((study) => study.metrics[metric]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => {
    const x = 24 + index * (252 / Math.max(values.length - 1, 1));
    const normalized = max === min ? 0.5 : (value - min) / (max - min);
    const y = 112 - normalized * 78;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg className="trend-chart" viewBox="0 0 310 140" role="img" aria-label={`${metric} trend`}>
      <line x1="20" y1="116" x2="292" y2="116" />
      <line x1="20" y1="20" x2="20" y2="116" />
      <polyline points={points} />
      {points.split(" ").map((point, index) => {
        const [x, y] = point.split(",");
        return <circle cx={x} cy={y} r="4" key={`${point}-${index}`} />;
      })}
      <text x="24" y="132">AI initial</text>
      <text x="206" y="132">Reviewer final</text>
    </svg>
  );
}

export function PatientHistoryView({ studies }: PatientHistoryViewProps) {
  return (
    <div className="view-stack">
      <section className="history-hero">
        <div><p>Patient History / Data Governance</p><h1>PAT-0087</h1><StatusBadge tone="teal">De-identified</StatusBadge></div>
        <div className="history-stats"><span><strong>{studies.length}</strong>Total studies</span><span><strong>{studies[studies.length - 1]?.studyDate}</strong>First study</span><span><strong>{studies[0]?.studyDate}</strong>Most recent</span></div>
        <div className="history-actions"><button className="ghost-button" type="button">Export Summary</button><button className="primary-button" type="button">Add Study</button></div>
      </section>
      <div className="workspace-tabs history-tabs"><button className="active" type="button">Longitudinal Overview</button><button type="button">Study Repository</button><button type="button">Activity & Audit</button><button type="button">Data Governance</button></div>
      <section className="history-grid">
        <article className="panel-card"><div className="section-title"><h2>Timeline de estudios</h2></div><div className="timeline">{studies.map((study) => <article key={study.caseId}><span className="timeline-dot" /><div><strong>{study.caseId}</strong><p>{study.studyDate} · {study.planes}</p><small>{study.modelVersion}</small></div><ReviewBadge status={study.reviewStatus} /><PriorityBadge priority={study.priority} /><button className="ghost-button" type="button">Compare</button></article>)}</div></article>
        <article className="panel-card"><div className="section-title"><h2>Trends over time</h2><span>AI initial vs Reviewer final</span></div><div className="trend-grid"><div><strong>Lordosis Angle</strong><TrendChart studies={studies} metric="lordosisAngle" /></div><div><strong>Central Canal Diameter</strong><TrendChart studies={studies} metric="canalDiameter" /></div><div><strong>Average Disc Height</strong><TrendChart studies={studies} metric="averageDiscHeight" /></div><div><strong>L4-L5 Disc Height</strong><TrendChart studies={studies} metric="l45DiscHeight" /></div></div></article>
      </section>
      <section className="history-grid two">
        <article className="panel-card"><div className="section-title"><h2>Key Measurements AI vs Reviewer</h2></div><div className="table-wrap"><table className="worklist-table"><thead><tr><th>Study</th><th>Metric</th><th>AI Initial</th><th>Reviewer Final</th><th>Delta</th></tr></thead><tbody>{studies.slice(0, 4).map((study, index) => <tr key={study.caseId}><td>{study.caseId}</td><td>L4-L5 Disc Height</td><td>{(study.metrics.l45DiscHeight + 0.4).toFixed(1)} mm</td><td>{study.metrics.l45DiscHeight.toFixed(1)} mm</td><td className={index === 1 ? "delta-alert" : ""}>-0.4 mm</td></tr>)}</tbody></table></div></article>
        <article className="panel-card"><div className="section-title"><h2>Data Governance & Privacy</h2></div><ul className="check-list"><li>Academic/research use only</li><li>Data de-identified</li><li>No direct identifiers</li><li>Export restricted</li><li>Human review required</li><li>Retention policy configurable</li></ul><div className="export-rules"><span>Raw images <strong>Not permitted</strong></span><span>Full reports <strong>Not permitted</strong></span><span>Per-patient export <strong>Not permitted</strong></span><span>Derived metrics and de-identified visuals <strong>Permitted</strong></span></div></article>
      </section>
      <section className="panel-card"><div className="section-title"><h2>Study Library</h2><span>Research/testing sources only</span></div><div className="library-grid"><article><strong>SPIDER public dataset</strong><p>Fuente publica para investigacion y pruebas de segmentacion.</p></article><article><strong>VerSe de-identified/external</strong><p>Referencia externa de-identificada para benchmarking academico.</p></article><article><strong>LumbarDISC</strong><p>Dataset complementario de clasificacion, no datos clinicos internos.</p></article></div></section>
      <PrivacyBanner />
    </div>
  );
}
