import "./theme.css";
import "./mri-theme.css";
import { useEffect, useMemo, useState } from "react";
import { getDemoStudyReview, getHealth, getModels, getStudies, getSystemDiagnostics, isDemoMode, normalizeRun, runPipeline, updateReview } from "./api";
import { logoutDoctor, updateDoctorSettings } from "./authClient";
import { hydrateAuthSession, loadAuthSession } from "./authStorage";
import { AppShell } from "./components/AppShell";
import { AuthView } from "./components/AuthView";
import { AiMvpCompletionCard } from "./components/AiMvpCompletionCard";
import { DashboardView } from "./components/DashboardView";
import { OnboardingTutorial } from "./components/OnboardingTutorial";
import { PatientHistoryView } from "./components/PatientHistoryView";
import { PendingApprovalView } from "./components/PendingApprovalView";
import { StudyReviewView } from "./components/StudyReviewView";
import { SystemDiagnosticsView } from "./components/SystemDiagnosticsView";
import { initialAuditTrail, patientStudies, worklistStudies } from "./data/mockStudies";
import { sampleRun } from "./mock/sampleRun";
import { appendBackendAudit, getBackendReviewSnapshot, saveBackendMeasurements } from "./reviewPersistenceApi";
import { loadSelectedStudyDetail, saveSelectedStudyDetail, saveSelectedStudyFallback } from "./selectedStudyStorage";
import { appendAuditEvent, loadReviewHistory, saveMeasurementEdits, saveProfessionalReview, saveRun } from "./storage";
import { fetchStudyDetail } from "./studyApi";
import { fetchSubjectHistory } from "./subjectHistoryApi";
import type { AiModel, AiRunResponse, AuditEvent, AuthSession, Measurement, PatientHistoryResponse, PatientStudy, ReviewStatus, StudiesSummary, StudyRow, SystemDiagnostics, ViewKey } from "./appTypes";

type InferenceMode = "contract" | "real";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function inferenceModeFromDiagnostics(diagnostics?: SystemDiagnostics | null): InferenceMode {
  const aiModule = asRecord(diagnostics?.aiModule);
  const response = asRecord(aiModule?.response);
  const models = asRecord(aiModule?.models);
  const summary = asRecord(aiModule?.artifactSummary) ?? asRecord(response?.artifactSummary) ?? asRecord(models?.summary);
  const defaultMode = String(summary?.defaultInferenceMode ?? aiModule?.defaultInferenceMode ?? "contract");
  const readyForRealInference = summary?.readyForRealInference === true;
  return defaultMode === "real" && readyForRealInference ? "real" : "contract";
}

function metricsForStudy(study: StudyRow, index: number) {
  const seed = Math.abs((study.caseId.charCodeAt(study.caseId.length - 1) || index) + index) % 7;
  return { lordosisAngle: 41 + seed * 1.8, canalDiameter: 11 + seed * 0.45, averageDiscHeight: 7.4 + seed * 0.25, l45DiscHeight: 7.1 + seed * 0.35 };
}

function toPatientStudy(study: StudyRow, index: number): PatientStudy {
  return { caseId: study.caseId, studyDate: study.studyDate, planes: study.plane, modelVersion: study.modelKey, reviewStatus: study.reviewStatus, priority: study.priority, metrics: metricsForStudy(study, index) };
}

function runFromStudy(study: StudyRow): AiRunResponse {
  return normalizeRun({
    runId: study.runId,
    caseId: study.caseId,
    patientId: study.patientId,
    studyDate: study.studyDate,
    plane: study.plane,
    modelKey: study.modelKey,
    inputPath: `demo/${study.caseId}`,
    measurements: [],
    measurementValues: [],
    review: { runId: study.runId, status: study.reviewStatus },
    reviewStatus: study.reviewStatus,
    metadata: { source: "worklist-selection", deidentified: true },
    aiOutput: undefined,
    series: undefined,
    masks: undefined,
    landmarks: undefined,
    modelArtifact: undefined,
    quality: undefined,
  });
}

function LoadingState({ title, detail }: { title: string; detail: string }) {
  return <section className="panel-card clinical-loading-state" aria-live="polite"><span className="clinical-spinner" /><div><h2>{title}</h2><p>{detail}</p></div></section>;
}

function reviewRequiresNotes(status: ReviewStatus, notes: string) {
  return (status === "observado" || status === "descartado") && notes.trim().length < 5;
}

function approvalWasCancelled(status: ReviewStatus) {
  if (status !== "aceptado") return false;
  return !window.confirm("Confirmo que revisé visualmente las máscaras, mediciones, trazabilidad del modelo y que esta aprobación corresponde a una revisión profesional humana. Esta salida no constituye diagnóstico clínico autónomo.");
}

function isBackendValidationError(error: unknown) {
  return error instanceof Error && (error.message.includes("400") || error.message.toLowerCase().includes("nota profesional"));
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [authBootstrapping, setAuthBootstrapping] = useState(true);
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
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>("contract");
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(Boolean(loadAuthSession()));
  const [saving, setSaving] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
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
  const pendingApproval = Boolean(session && (session.user.approved === false || session.user.roles.includes("PENDING_APPROVAL")));
  const needsOnboarding = Boolean(session && session.user.approved !== false && !session.user.roles.includes("PENDING_APPROVAL") && session.user.onboardingCompleted === false);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const restored = await hydrateAuthSession();
        if (!cancelled && restored) setSession(restored);
      } finally {
        if (!cancelled) setAuthBootstrapping(false);
      }
    }
    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session || pendingApproval) return;
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
        const [healthResponse, modelResponse, studyResponse, demoStudyReview, backendSnapshot, diagnosticsResponse] = await Promise.all([
          getHealth(),
          getModels(),
          getStudies().catch(() => null),
          getDemoStudyReview().catch(() => null),
          getBackendReviewSnapshot().catch(() => null),
          getSystemDiagnostics().catch(() => null),
        ]);
        if (cancelled) return;
        setHealth(healthResponse.status ?? "sin_estado");
        setModels(modelResponse);
        setInferenceMode(inferenceModeFromDiagnostics(diagnosticsResponse));
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
  }, [session, pendingApproval]);

  function recordAudit(action: string, detail: string, actor = "Reviewer") {
    setAuditTrail(appendAuditEvent({ action, detail, actor }));
    if (session) void appendBackendAudit(actor, action, detail).catch(() => undefined);
  }

  function logout() {
    void logoutDoctor().finally(() => setSession(null));
  }

  async function completeOnboarding() {
    setOnboardingSaving(true);
    try {
      const user = await updateDoctorSettings({ onboardingCompleted: true });
      setSession((current) => current ? { ...current, user } : current);
    } catch {
      setSession((current) => current ? { ...current, user: { ...current.user, onboardingCompleted: true } } : current);
    } finally {
      setOnboardingSaving(false);
    }
  }

  function handleOpenReview(study: StudyRow) {
    saveSelectedStudyFallback(study);
    setSelectedRun(runFromStudy(study));
    setMeasurements([]);
    setStudyReview(null);
    setActiveView("review");
    void fetchStudyDetail(study).then((detail) => {
      saveSelectedStudyDetail(detail);
      if (detail.measurements?.length) setMeasurements(detail.measurements);
      const firstRun = detail.runs?.[0];
      if (firstRun) {
        setSelectedRun((current) => normalizeRun({
          ...current,
          runId: firstRun.runId,
          caseId: detail.study.caseId,
          patientId: detail.study.patientId,
          studyDate: detail.study.studyDate,
          plane: firstRun.plane ?? detail.study.plane,
          modelKey: firstRun.modelKey ?? detail.study.modelKey,
          review: detail.review ?? current.review,
        }));
      }
    }).catch(() => undefined);
  }

  async function handleRunDemo() {
    setLoading(true); setError(""); setInfo("");
    try {
      const selectedDetail = loadSelectedStudyDetail();
      const selectedStudy = selectedDetail?.study;
      const selectedStoredRun = selectedDetail?.runs?.[0];
      const caseId = selectedStudy?.caseId ?? safeRun.caseId ?? sampleRun.caseId ?? "CASE-DEMO-0142";
      const plane = selectedStoredRun?.plane ?? selectedStudy?.plane ?? safeRun.plane ?? sampleRun.plane ?? "sagittal";
      const modelKey = selectedStoredRun?.modelKey ?? selectedStudy?.modelKey ?? safeRun.modelKey ?? "sagittal_spider";
      const patientId = selectedStudy?.patientId ?? safeRun.patientId ?? "PAT-0087";
      const studyDate = selectedStudy?.studyDate ?? safeRun.studyDate ?? "2026-07-01";
      const activeInferenceMode = inferenceMode;
      const response = await runPipeline({
        caseId,
        plane,
        modelKey,
        inputPath: `demo/${caseId}`,
        metadata: {
          source: selectedStudy ? "frontend-selected-worklist-study" : "frontend-review-workspace",
          uiVersion: "redesign-v1",
          frontendBaseUrl: window.location.origin,
          inferenceMode: activeInferenceMode,
          requestedBy: session?.user.fullName ?? "Reviewer",
          selectedFromWorklist: Boolean(selectedStudy),
          patientId,
          studyDate,
        },
      });
      const normalized = normalizeRun(response);
      setSelectedRun(normalized);
      setMeasurements(normalized.normalizedMeasurements ?? []);
      saveRun(normalized);
      recordAudit("pipeline run generado", `${normalized.caseId} ejecutado. Run ID ${normalized.runId}. inferenceMode=${activeInferenceMode}.`, "System");
      recordAudit("reporte agente recuperado", "Respuesta normalizada para revisión profesional.", "AI Agent");
      setInfo(isDemoMode() ? "Modo demo local activo o fallback aplicado. La interfaz conserva el flujo de revisión." : `Caso ${caseId} ejecutado contra el backend en modo ${activeInferenceMode}. La respuesta se muestra como salida técnica revisable.`);
      setActiveView("review");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "No se pudo ejecutar el caso seleccionado");
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
    const trimmedNotes = notes.trim();
    if (reviewRequiresNotes(status, trimmedNotes)) {
      setError("Para observar o descartar un caso, agregá una nota profesional descriptiva.");
      setSaving(false);
      return undefined;
    }
    if (approvalWasCancelled(status)) {
      setInfo("Aprobación cancelada. No se guardaron cambios de estado.");
      setSaving(false);
      return undefined;
    }
    const runId = safeRun.runId ?? "local-run";
    try {
      const review = await updateReview(runId, { status, notes: trimmedNotes, observations: trimmedNotes, reviewer: session?.user.fullName ?? "Reviewer" });
      setSelectedRun((current) => ({ ...current, review }));
      setBackendStudies((current) => current.map((row) => row.runId === runId ? { ...row, reviewStatus: review.status ?? status } : row));
      saveProfessionalReview(runId, review);
      recordAudit(status === "aceptado" ? "estado aprobado" : status === "observado" ? "estado observado" : "revision guardada", `Revision ${status} guardada para ${runId}.`);
      setInfo(isDemoMode() ? "Revision guardada en modo demo local porque el backend no confirmo la operacion." : "Revision guardada correctamente en el backend.");
      return review;
    } catch (reviewError) {
      if (isBackendValidationError(reviewError)) {
        setError(reviewError instanceof Error ? reviewError.message : "La revisión no cumple las reglas profesionales requeridas.");
        return undefined;
      }
      const fallbackReview = { runId, status, notes: trimmedNotes, observations: trimmedNotes, reviewer: session?.user.fullName ?? "Reviewer", updatedAt: new Date().toISOString() };
      setSelectedRun((current) => ({ ...current, review: fallbackReview }));
      setBackendStudies((current) => current.map((row) => row.runId === runId ? { ...row, reviewStatus: status } : row));
      saveProfessionalReview(runId, fallbackReview);
      recordAudit("revision guardada", `Fallback local aplicado para ${runId}.`);
      setInfo("No se pudo confirmar el PATCH en backend; revision guardada localmente.");
      return fallbackReview;
    } finally { setSaving(false); }
  }

  if (authBootstrapping) return <LoadingState title="Restaurando sesión" detail="Validando credenciales guardadas." />;
  if (!session) return <AuthView onAuthenticated={setSession} />;
  if (pendingApproval) return <PendingApprovalView session={session} onLogout={logout} />;

  return (
    <AppShell activeView={activeView} onChangeView={setActiveView} health={health} modelCount={models.length} aiModuleAvailable={safeRun.aiModuleAvailable} degradedMode={safeRun.degradedMode} currentRunId={safeRun.runId} onRunDemo={handleRunDemo} loading={loading} userName={session.user.fullName} onLogout={logout}>
      {needsOnboarding && <OnboardingTutorial saving={onboardingSaving} onComplete={() => void completeOnboarding()} />}
      {error && <div className="toast error">{error}</div>}
      {info && <div className="toast info">{info}</div>}
      {activeView === "dashboard" && (shouldShowDataLoading ? <LoadingState title="Cargando worklist" detail="Consultando estudios de-identificados desde backend/Postgres." /> : <DashboardView studies={studies} summary={studiesSummary} auditTrail={auditTrail} onOpenReview={handleOpenReview} />)}
      {activeView === "review" && <StudyReviewView run={safeRun} studyReview={studyReview} measurements={measurements} auditTrail={auditTrail} saving={saving} onMeasurementsChange={handleMeasurementsChange} onSaveReview={handleSaveReview} />}
      {activeView === "history" && (shouldShowDataLoading ? <LoadingState title="Cargando historial" detail="Preparando historial longitudinal desde los estudios del backend." /> : <PatientHistoryView studies={visiblePatientStudies} subjectRef={historySubjectRef} source={patientHistoryResponse?.source} summary={patientHistoryResponse?.summary} governance={patientHistoryResponse?.governance} />)}
      {activeView === "settings" && <><AiMvpCompletionCard /><SystemDiagnosticsView /></>}
    </AppShell>
  );
}

export default App;
