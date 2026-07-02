import "./theme.css";
import "./mri-theme.css";
import { useEffect, useMemo, useState } from "react";
import { getDemoStudyReview, getHealth, getModels, getStudies, isDemoMode, normalizeRun, runPipeline, updateReview } from "./api";
import { clearAuthSession, loadAuthSession } from "./authStorage";
import { AppShell } from "./components/AppShell";
import { AuthView } from "./components/AuthView";
import { DashboardView } from "./components/DashboardView";
import { PatientHistoryView } from "./components/PatientHistoryView";
import { StudyReviewView } from "./components/StudyReviewView";
import { SystemDiagnosticsView } from "./components/SystemDiagnosticsView";
import { initialAuditTrail, patientStudies, worklistStudies } from "./data/mockStudies";
import { sampleRun } from "./mock/sampleRun";
import { appendBackendAudit, getBackendReviewSnapshot, saveBackendMeasurements } from "./reviewPersistenceApi";
import { appendAuditEvent, loadReviewHistory, saveMeasurementEdits, saveProfessionalReview, saveRun } from "./storage";
import { fetchSubjectHistory } from "./subjectHistoryApi";
import type { AiModel, AiRunResponse, AuditEvent, AuthSession, Measurement, PatientHistoryResponse, PatientStudy, ReviewStatus, StudiesSummary, StudyRow, ViewKey } from "./appTypes";

function metricsForStudy(study: StudyRow, index: number) {
  const seed = Math.abs((study.caseId.charCodeAt(study.caseId.length - 1) || index) + index) % 7;
  return { lordosisAngle: 41 + seed * 1.8, canalDiameter: 11 + seed * 0.45, averageDiscHeight: 7.4 + seed * 0.25, l45DiscHeight: 7.1 + seed * 0.35 };
}

function toPatientStudy(study: StudyRow, index: number): PatientStudy {
  return { caseId: study.caseId, studyDate: study.studyDate, planes: study.plane, modelVersion: study.modelKey, reviewStatus: study.reviewStatus, priority: study.priority, metrics: metricsForStudy(study, index) };
}

function LoadingState({ title, detail }: { title: string; detail: string }) {
  return <section className="panel-card clinical-loading-state" aria-live="polite"><span className="clinical-spinner" /><div><h2>{title}</h2><p>{detail}</p></div></section>;
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [health, setHealth] = useState("consultando");
  const [models, setModels] = useState<AiModel[]>([]);
  const [backendStudies, setBackendStudies] = useState<StudyRow[]>([]);
  const [studiesSummary, setStudiesSummary] = useState<StudiesSummary | undefined>();
  const [patientHistoryResponse, setPatientHistoryResponse] = useState<PatientHistoryResponse | null>(null);
  const [selectedRun, setSelectedRun] = useState<AiRunResponse>(() => normalizeRun(sampleRun));
  const [studyReview, setStudyReview] = useState<any | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>(() => normalizeRun(sampleRun).normalizedMeasurements ?? []);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>(initialAuditTrail);
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(Boolean(loadAuthSession()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const safeRun = useMemo(() => normalizeRun(selectedRun), [selectedRun]);
  const history = useMemo(() => loadReviewHistory(), [auditTrail, selectedRun]);
  const studies = useMemo(() => {
    const baseRows = backendStudies.length ? backendStudies : bootstrapLoading ? [] : worklistStudies;
    const currentRunId = safeRun.runId;
    return baseRows.map((row, index) => {
      if (index !== 0 && row.runId !== currentRunId) return row;
      return {
        ...row,
        caseId: safeRun.caseId ?? row.caseId,
        plane: safeRun.plane ?? row.plane,
        modelKey: safeRun.modelKey ?? row.modelKey,
        modelStatus: safeRun.measurementsStatus === "pending_real_inference" ? "Pipeline tecnico / inferencia pendiente" : safeRun.degradedMode ? "Modo degradado" : row.modelStatus,
        reviewStatus: safeRun.review?.status ?? row.reviewStatus,
        priority: safeRun.agentDecision?.priority ?? row.priority,
        runId: safeRun.runId ?? row.runId,
      };
    });
  }, [backendStudies, bootstrapLoading, safeRun]);
  const backendPatientStudies = useMemo(() => studies.map(toPatientStudy), [studies]);
  const visiblePatientStudies = patientHistoryResponse?.studies?.length
    ? patientHistoryResponse.studies
    : backendPatientStudies.length
      ? backendPatientStudies
      : bootstrapLoading
        ? []
        : history.patientStudies.length
          ? history.patientStudies
          : patientStudies;
  const shouldShowDataLoading = bootstrapLoading && backendStudies.length === 0;
  const historySubjectRef = patientHistoryResponse?.subjectRef ?? backendStudies[0]?.patientId ?? "PAT-0087";

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const stored = loadReviewHistory();
    setAuditTrail(stored.auditTrail.length > 0 ? stored.auditTrail : initialAuditTrail);
    setBootstrapLoading(true);

    const normalized = normalizeRun(stored.runs[0] ?? sampleRun);
    const runId = normalized.runId ?? "demo-run-2026-001";
    const storedMeasurements = stored.measurementsByRunId[runId];
    const storedReview = stored.reviewsByRunId[runId];
    setSelectedRun(storedReview ? { ...normalized, review: storedReview } : normalized);
    setMeasurements(storedMeasurements ?? normalized.normalizedMeasurements ?? []);

    async function bootstrap() {
      try {
        const [healthResponse, modelResponse, studyResponse, demoStudyReview, backendSnapshot] = await Promise.all([
          getHealth(),
          getModels(),
          getStudies().catch(() => null),
          getDemoStudyReview().catch(() => null),
          getBackendReviewSnapshot().catch(() => null),
        ]);
        if (cancelled) return;
        setHealth(healthResponse.status ?? "sin_estado");
        setModels(modelResponse);
        const subjectRef = studyResponse?.items?.[0]?.patientId ?? "PAT-0087";
        if (studyResponse?.items?.length) {
          setBackendStudies(studyResponse.items);
          setStudiesSummary(studyResponse.summary);
        }
        const subjectHistory = await fetchSubjectHistory(subjectRef).catch(() => null);
        if (!cancelled && subjectHistory?.studies?.length) setPatientHistoryResponse(subjectHistory);
        setStudyReview(demoStudyReview);
        if (backendSnapshot?.auditTrail?.length) setAuditTrail(backendSnapshot.auditTrail);
        const backendMeasurements = backendSnapshot?.measurementsByRunId?.[runId];
        if (backendMeasurements?.length) {
          setMeasurements(backendMeasurements);
          saveMeasurementEdits(runId, backendMeasurements);
        }
        const backendReview = backendSnapshot?.reviews?.find((item) => item.runId === runId);
        if (backendReview) {
          setSelectedRun((current) => ({ ...current, review: backendReview }));
          saveProfessionalReview(runId, backendReview);
        }
      } catch (bootstrapError) {
        if (!cancelled) setError(bootstrapError instanceof Error ? bootstrapError.message : "No se pudo consultar el backend");
      } finally {
        if (!cancelled) setBootstrapLoading(false);
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [session]);

  function recordAudit(action: string, detail: string, actor = "Reviewer") {
    setAuditTrail(appendAuditEvent({ action, detail, actor }));
    if (session) void appendBackendAudit(actor, action, detail).catch(() => undefined);
  }

  function logout() { clearAuthSession(); setSession(null); }

  async function handleRunDemo() {
    setLoading(true); setError(""); setInfo("");
    try {
      const response = await runPipeline({ caseId: sampleRun.caseId ?? "CASE-DEMO-0142", plane: sampleRun.plane ?? "sagittal", modelKey: "sagittal_spider", inputPath: "demo/CASE-DEMO-0142", metadata: { source: "frontend-review-workspace", uiVersion: "redesign-v1", frontendBaseUrl: window.location.origin } });
      const normalized = normalizeRun(response);
      setSelectedRun(normalized);
      setMeasurements(normalized.normalizedMeasurements ?? []);
      saveRun(normalized);
      recordAudit("pipeline run generado", `${normalized.caseId} ejecutado. Run ID ${normalized.runId}.`, "System");
      recordAudit("reporte agente recuperado", "Respuesta normalizada para revision profesional.", "AI Agent");
      setInfo(isDemoMode() ? "Modo demo local activo o fallback aplicado. La interfaz conserva el flujo de revision." : "Caso demo ejecutado contra el backend. La respuesta se muestra como salida tecnica revisable.");
      setActiveView("review");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "No se pudo ejecutar el caso demo");
    } finally { setLoading(false); }
  }

  function handleMeasurementsChange(nextMeasurements: Measurement[], detail: string) {
    const runId = safeRun.runId ?? "local-run";
    setMeasurements(nextMeasurements);
    saveMeasurementEdits(runId, nextMeasurements);
    void saveBackendMeasurements(runId, nextMeasurements, session?.user.fullName ?? "Reviewer", detail).catch(() => undefined);
    recordAudit("medicion editada", detail);
  }

  async function handleSaveReview(status: ReviewStatus, notes: string) {
    setSaving(true); setError(""); setInfo("");
    const runId = safeRun.runId ?? "local-run";
    try {
      const review = await updateReview(runId, { status, notes, observations: notes, reviewer: session?.user.fullName ?? "Reviewer" });
      setSelectedRun((current) => ({ ...current, review }));
      setBackendStudies((current) => current.map((row) => row.runId === runId ? { ...row, reviewStatus: review.status ?? status } : row));
      saveProfessionalReview(runId, review);
      recordAudit(status === "aceptado" ? "estado aprobado" : status === "observado" ? "estado observado" : "revision guardada", `Revision ${status} guardada para ${runId}.`);
      setInfo(isDemoMode() ? "Revision guardada en modo demo local porque el backend no confirmo la operacion." : "Revision guardada correctamente en el backend.");
      return review;
    } catch {
      const fallbackReview = { runId, status, notes, observations: notes, reviewer: session?.user.fullName ?? "Reviewer", updatedAt: new Date().toISOString() };
      setSelectedRun((current) => ({ ...current, review: fallbackReview }));
      setBackendStudies((current) => current.map((row) => row.runId === runId ? { ...row, reviewStatus: status } : row));
      saveProfessionalReview(runId, fallbackReview);
      recordAudit("revision guardada", `Fallback local aplicado para ${runId}.`);
      setInfo("No se pudo confirmar el PATCH en backend; revision guardada localmente.");
      return fallbackReview;
    } finally { setSaving(false); }
  }

  if (!session) return <AuthView onAuthenticated={setSession} />;

  return (
    <AppShell activeView={activeView} onChangeView={setActiveView} health={health} modelCount={models.length} aiModuleAvailable={safeRun.aiModuleAvailable} degradedMode={safeRun.degradedMode} onRunDemo={handleRunDemo} loading={loading} userName={session.user.fullName} onLogout={logout}>
      {error && <div className="toast error">{error}</div>}
      {info && <div className="toast info">{info}</div>}
      {activeView === "dashboard" && (shouldShowDataLoading ? <LoadingState title="Cargando worklist" detail="Consultando estudios de-identificados desde backend/Postgres." /> : <DashboardView studies={studies} summary={studiesSummary} auditTrail={auditTrail} onOpenReview={() => setActiveView("review")} />)}
      {activeView === "review" && <StudyReviewView run={safeRun} studyReview={studyReview} measurements={measurements} auditTrail={auditTrail} saving={saving} onMeasurementsChange={handleMeasurementsChange} onSaveReview={handleSaveReview} />}
      {activeView === "history" && (shouldShowDataLoading ? <LoadingState title="Cargando historial" detail="Preparando historial longitudinal desde los estudios del backend." /> : <PatientHistoryView studies={visiblePatientStudies} subjectRef={historySubjectRef} source={patientHistoryResponse?.source} summary={patientHistoryResponse?.summary} governance={patientHistoryResponse?.governance} />)}
      {activeView === "settings" && <SystemDiagnosticsView />}
    </AppShell>
  );
}

export default App;
