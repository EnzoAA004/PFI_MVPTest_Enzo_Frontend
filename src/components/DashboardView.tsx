import type { AuditEvent, StudyRow } from "../types";
import { AuditTrail } from "./AuditTrail";
import { MetricCard } from "./MetricCard";
import { PrivacyBanner } from "./PrivacyBanner";
import { SpineReconstructionPreview } from "./SpineReconstructionPreview";
import { WorklistTable } from "./WorklistTable";

interface DashboardViewProps {
  studies: StudyRow[];
  auditTrail: AuditEvent[];
  onOpenReview: () => void;
}

export function DashboardView({ studies, auditTrail, onOpenReview }: DashboardViewProps) {
  return (
    <div className="view-stack">
      <section className="page-heading">
        <div>
          <p>Academic lumbar MRI operations</p>
          <h1>Dashboard / Worklist</h1>
        </div>
        <div className="safety-copy">
          <strong>Human review required.</strong>
          <span>AI output may be inaccurate. Please verify all results.</span>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard label="Pending Reviews" value="14" detail="7 standard priority" tone="amber" />
        <MetricCard label="AI-ready Studies" value="28" detail="technical pipeline available" tone="teal" />
        <MetricCard label="Model Status" value="Online" detail="backend + AI module monitored" tone="green" />
        <MetricCard label="Flagged Cases" value="5" detail="requires closer inspection" tone="purple" />
      </section>

      <section className="dashboard-grid">
        <article className="panel-card wide-card">
          <div className="section-title">
            <h2>Worklist</h2>
            <button className="ghost-button" onClick={onOpenReview} type="button">Open Study Review</button>
          </div>
          <WorklistTable studies={studies} onOpenReview={onOpenReview} />
        </article>
        <aside className="right-rail">
          <article className="panel-card">
            <div className="section-title"><h2>Latest Segmentation Preview</h2><span>CASE-DEMO-0142</span></div>
            <div className="mini-mri">
              <span className="mini-vertebra v1" />
              <span className="mini-vertebra v2" />
              <span className="mini-vertebra v3" />
              <span className="mini-overlay" />
            </div>
          </article>
          <article className="panel-card">
            <div className="section-title"><h2>3D Lumbar Spine Preview</h2><span>L1-S1</span></div>
            <SpineReconstructionPreview />
          </article>
          <article className="panel-card">
            <div className="section-title"><h2>Recent Activity / Audit Log</h2></div>
            <AuditTrail events={auditTrail} />
          </article>
        </aside>
      </section>
      <PrivacyBanner />
    </div>
  );
}
