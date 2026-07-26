import { useEffect, useMemo, useState } from "react";
import { getHealth, getModels, getStudies, isDemoMode, normalizeRun, updateReview } from "./api";
import { logoutDoctor, updateDoctorSettings } from "./authClient";
import { hydrateAuthSession, loadAuthSession } from "./authStorage";
import { AnalysisTimelineView } from "./components/AnalysisTimelineView";
import { AppShell } from "./components/AppShell";
import { AuthView } from "./components/AuthView";
import { DashboardView } from "./components/DashboardView";
import { HelpSupportView } from "./components/HelpSupportView";
import { OnboardingTutorial } from "./components/OnboardingTutorial";
import { PatientHistoryView } from "./components/PatientHistoryView";
import { PatientsView } from "./components/PatientsView";
import { PendingApprovalView } from "./components/PendingApprovalView";
import { ProfessionalSettingsView } from "./components/ProfessionalSettingsView";
import { StudyReviewView } from "./components/StudyReviewView";
import { StudiesView } from "./components/StudiesView";
import { isDemoDataMode, validateVisibleDataOrigin } from "./dataMode";
import { appendBackendAudit, getBackendReviewSnapshot, saveBackendMeasurements } from "./reviewPersistenceApi";
import { saveSelectedStudyDetail, saveSelectedStudyFallback } from "./selectedStudyStorage";
import { appendAuditEvent, loadReviewHistory, saveMeasurementEdits, saveProfessionalReview } from "./storage";
import { fetchStudyDetail } from "./studyApi";
import { fetchSubjectHistory } from "./subjectHistoryApi";
import type { AiModel, AiRunResponse, AuditEvent, AuthSession, Measurement, PatientHistoryResponse, PatientStudy, ReviewStatus, StudiesSummary, StudyRow, ViewKey } from "./appTypes";

function toPatientStudy(study: StudyRow): PatientStudy {
  return { caseId: study.caseId, studyDate: study.studyDate, planes: study.plane, modelVersion: study.modelKey, reviewStatus: study.reviewStatus, priority: study.priority };
}

function runFromStudy(study: StudyRow): AiRunResponse {
  return {
    runId: study.runId,
    caseId: study.caseId,
    patientId: study.patientId,
    studyDate: study.studyDate,
    plane: study.plane,
    modelKey: study.modelKey,
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
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    dataOrigin: "backend",
  };
}

function LoadingState({ title, detail }: { title: string; detail: string }) {
  return <section className="panel-card clinical-loading-state" aria-live="polite"><span className="clinical-spinner" /><div><h2>{title}</h2><p>{detail}</p></div></section>;
}

function EmptyReviewState({ onBackToStudies }: { onBackToStudies: () => void }) {
  return (
    <section className="panel-card clinical-empty-state">
      <h2>No hay corrida seleccionada</h2>
      <p>Selecciona un estudio real desde Estudios o Cola de revision, o inicia un Nuevo analisis con carga sagital real.</p>
      <button className="button secondary" type="button" onClick={onBackToStudies}>Volver a estudios</button>
    </section>
  );
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
  const [lastStudyNavView, setLastStudyNavView] = useState<"studies" | "queue">("studies");
  const [health, setHealth] = useState("consultando");
  const [models, setModels] = useState<AiModel[]>([]);
  const [backendStudies, setBackendStudies] = useState<StudyRow[]>([]);
  const [studiesBackendAvailable, setStudiesBackendAvailable] = useState(false);
  const [selectedSubjectRef, setSelectedSubjectRef] = useState<string | null>(null);
  const [studiesSummary, setStudiesSummary] = useState<StudiesSummary | undefined>();
  const [patientHistoryResponse, setPatientHistoryResponse] = useState<PatientHistoryResponse | null>(null);
  const [selectedRun, setSelectedRun] = useState<AiRunResponse | null>(null);
  const [studyReview, setStudyReview] = useState<any | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(Boolean(loadAuthSession()));
  const [saving, setSaving] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [bootstrapRetryNonce, setBootstrapRetryNonce] = useState(0);

  const safeRun = useMemo(() => {
    if (!selectedRun) return null;
    try {
      return isDemoDataMode ? selectedRun : normalizeRun(selectedRun);
    } catch {
      return selectedRun;
    }
  }, [selectedRun]);
  const studies = useMemo(() => {
    const baseRows = backendStudies;
    const currentRunId = safeRun?.runId;
    return baseRows.map((row, index) => {
      if (index !== 0 && row.runId !== currentRunId) return row;
      return {
        ...row,
        caseId: safeRun?.caseId ?? row.caseId,
        plane: safeRun?.plane ?? row.plane,
        modelKey: safeRun?.modelKey ?? row.modelKey,
        modelStatus: safeRun?.measurementsStatus === "pending_real_inference" ? "Pipeline tecnico / inferencia pendiente" : safeRun?.degradedMode ? "Modo degradado" : row.modelStatus,
        reviewStatus: safeRun?.review?.status ?? row.reviewStatus,
        priority: safeRun?.agentDecision?.priority ?? row.priority,
        runId: safeRun?.runId ?? row.runId,
      };
    });
  }, [backendStudies, safeRun]);
  const backendPatientStudies = useMemo(() => {
    if (!backendStudies.length) return [];
    const subjectRef = selectedSubjectRef ?? patientHistoryResponse?.subjectRef ?? backendStudies[0]?.patientId;
    return studies.filter((study) => !subjectRef || study.patientId === subjectRef).map(toPatientStudy);
  }, [backendStudies, patientHistoryResponse?.subjectRef, selectedSubjectRef, studies]);
  const visiblePatientStudies = patientHistoryResponse?.studies?.length
    ? patientHistoryResponse.studies
    : backendPatientStudies.length
      ? backendPatientStudies
      : bootstrapLoading
        ? []
        : [];
  const shouldShowDataLoading = bootstrapLoading && backendStudies.length === 0;
  const historySubjectRef = selectedSubjectRef ?? patientHistoryResponse?.subjectRef ?? backendStudies[0]?.patientId ?? "Sin paciente seleccionado";
  const realStudyRows = studiesBackendAvailable ? studies : [];
  const reviewQueueCount = realStudyRows.filter((study) => study.reviewStatus === "pendiente" || study.reviewStatus === "observado").length;
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
    const stored = isDemoDataMode ? loadReviewHistory() : { runs: [], measurementsByRunId: {}, reviewsByRunId: {}, auditTrail: [], patientStudies: [] };
    setAuditTrail(isDemoDataMode ? stored.auditTrail : []);
    setBootstrapLoading(true);
    setError("");
    setSelectedRun(isDemoDataMode && stored.runs[0] ? stored.runs[0] : null);
    setMeasurements([]);

    async function bootstrap() {
      try {
        const [healthResponse, modelResponse, studyResponse, backendSnapshot] = await Promise.all([
          getHealth(),
          getModels(),
          getStudies(),
          getBackendReviewSnapshot().catch(() => null),
        ]);
        if (cancelled) return;
        setHealth(healthResponse.status ?? "sin_estado");
        setModels(modelResponse);
        const subjectRef = studyResponse.items[0]?.patientId;
        setStudiesBackendAvailable(studyResponse.status !== "demo");
        setBackendStudies(studyResponse.items);
        setStudiesSummary(studyResponse.summary);
        studyResponse.items.forEach((study) => validateVisibleDataOrigin(`estudio ${study.caseId}`, study.dataOrigin));
        if (subjectRef) {
          const subjectHistory = await fetchSubjectHistory(subjectRef).catch(() => null);
          if (!cancelled && subjectHistory?.studies?.length) setPatientHistoryResponse(subjectHistory);
        }
        setStudyReview(null);
        if (backendSnapshot?.auditTrail?.length) setAuditTrail(backendSnapshot.auditTrail);
      } catch (bootstrapError) {
        if (!cancelled) {
          const detail = bootstrapError instanceof Error ? bootstrapError.message : "Error desconocido";
          setBackendStudies([]);
          setStudiesBackendAvailable(false);
          setError(`No se pudo consultar el backend. Reintenta cuando el servicio este disponible. Detalle: ${detail}`);
        }
      } finally {
        if (!cancelled) setBootstrapLoading(false);
      }
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [bootstrapRetryNonce, session, pendingApproval]);

  function recordAudit(action: string, detail: string, actor = "Revisor") {
    setAuditTrail(appendAuditEvent({ action, detail, actor }));
    if (session) void appendBackendAudit(actor, action, detail).catch(() => undefined);
  }

  function logout() {
    void logoutDoctor().finally(() => setSession(null));
  }

  function changeView(view: ViewKey) {
    if (view === "studies" || view === "queue") setLastStudyNavView(view);
    setActiveView(view);
  }

  function retryBootstrap() {
    setInfo("");
    setBootstrapRetryNonce((value) => value + 1);
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
    if (activeView === "studies" || activeView === "queue") setLastStudyNavView(activeView);
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
        setSelectedRun((current) => ({
          ...(current ?? {}),
          runId: firstRun.runId,
          caseId: detail.study.caseId,
          patientId: detail.study.patientId,
          studyDate: detail.study.studyDate,
          plane: firstRun.plane ?? detail.study.plane,
          modelKey: firstRun.modelKey ?? detail.study.modelKey,
          review: detail.review ?? current?.review,
          humanReviewRequired: true,
          notClinicalDiagnosis: true,
          dataOrigin: "backend",
        }));
      }
    }).catch((detailError) => {
      const detail = detailError instanceof Error ? detailError.message : "Error desconocido";
      setError(`No se pudo cargar el detalle del estudio. Detalle: ${detail}`);
    });
  }

  function handleOpenPatientHistory(patientId: string) {
    setSelectedSubjectRef(patientId);
    setPatientHistoryResponse(null);
    setActiveView("history");
    void fetchSubjectHistory(patientId).then((historyResponse) => {
      if (historyResponse?.studies?.length) setPatientHistoryResponse(historyResponse);
    }).catch(() => undefined);
  }

  function handleMeasurementsChange(nextMeasurements: Measurement[], detail: string) {
    const runId = safeRun?.runId;
    if (!runId) {
      setError("No hay una corrida real seleccionada para guardar mediciones.");
      return;
    }
    setMeasurements(nextMeasurements);
    saveMeasurementEdits(runId, nextMeasurements);
    void saveBackendMeasurements(runId, nextMeasurements, session?.user.fullName ?? "Revisor", detail).catch(() => undefined);
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
    const runId = safeRun?.runId;
    if (!runId) {
      setError("No hay una corrida real seleccionada para guardar la revision.");
      setSaving(false);
      return undefined;
    }
    try {
      const review = await updateReview(runId, { status, notes: trimmedNotes, observations: trimmedNotes, reviewer: session?.user.fullName ?? "Revisor" });
      setSelectedRun((current) => current ? { ...current, review } : current);
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
      if (isDemoMode()) {
        const fallbackReview = { runId, status, notes: trimmedNotes, observations: trimmedNotes, reviewer: session?.user.fullName ?? "Revisor", updatedAt: new Date().toISOString() };
        setSelectedRun((current) => current ? { ...current, review: fallbackReview } : current);
        setBackendStudies((current) => current.map((row) => row.runId === runId ? { ...row, reviewStatus: status } : row));
        saveProfessionalReview(runId, fallbackReview);
        recordAudit("revision guardada", `Fallback local aplicado para ${runId}.`);
        setInfo("No se pudo confirmar el PATCH en backend; revision guardada localmente en modo demo.");
        return fallbackReview;
      }
      const detail = reviewError instanceof Error ? reviewError.message : "Error desconocido";
      setError(`No se pudo guardar la revision en backend. Detalle: ${detail}`);
      return undefined;
    } finally { setSaving(false); }
  }

  if (authBootstrapping) return <LoadingState title="Restaurando sesión" detail="Validando credenciales guardadas." />;
  if (!session) return <AuthView onAuthenticated={setSession} />;
  if (pendingApproval) return <PendingApprovalView session={session} onLogout={logout} />;

  return (
    <AppShell activeView={activeView} activeNavView={activeView === "review" ? lastStudyNavView : activeView} onChangeView={changeView} health={health} modelCount={models.length} aiModuleAvailable={safeRun?.aiModuleAvailable ?? false} degradedMode={safeRun?.degradedMode ?? false} currentRunId={safeRun?.runId} onNewAnalysis={() => changeView("analysis")} loading={false} userName={session.user.fullName} onLogout={logout} reviewQueueCount={reviewQueueCount}>
      {needsOnboarding && <OnboardingTutorial saving={onboardingSaving} onComplete={() => void completeOnboarding()} />}
      {error && (
        <div className="toast error app-error-toast" role="alert">
          <span>{error}</span>
          <button className="ghost-button" onClick={retryBootstrap} type="button">Reintentar</button>
        </div>
      )}
      {info && <div className="toast info">{info}</div>}
      {activeView === "dashboard" && (shouldShowDataLoading ? <LoadingState title="Cargando lista de trabajo" detail="Consultando estudios deidentificados desde backend/Postgres." /> : <DashboardView studies={studies} summary={studiesSummary} auditTrail={auditTrail} health={health} aiModuleAvailable={safeRun?.aiModuleAvailable ?? false} degradedMode={safeRun?.degradedMode ?? false} onOpenDiagnostics={() => changeView("settings")} onOpenReview={handleOpenReview} />)}
      {activeView === "analysis" && <AnalysisTimelineView reviewerName={session.user.fullName} />}
      {activeView === "studies" && <StudiesView studies={realStudyRows} mode="all" loading={shouldShowDataLoading} onOpenReview={handleOpenReview} />}
      {activeView === "queue" && <StudiesView studies={realStudyRows} mode="queue" loading={shouldShowDataLoading} onOpenReview={handleOpenReview} />}
      {activeView === "review" && (safeRun ? <StudyReviewView run={safeRun} studyReview={studyReview} measurements={measurements} auditTrail={auditTrail} saving={saving} onBackToStudies={() => changeView(lastStudyNavView)} onMeasurementsChange={handleMeasurementsChange} onSaveReview={handleSaveReview} /> : <EmptyReviewState onBackToStudies={() => changeView(lastStudyNavView)} />)}
      {activeView === "patients" && <PatientsView studies={realStudyRows} loading={shouldShowDataLoading} onOpenHistory={handleOpenPatientHistory} />}
      {activeView === "history" && (shouldShowDataLoading ? <LoadingState title="Cargando historial" detail="Preparando historial longitudinal desde los estudios del backend." /> : <PatientHistoryView studies={visiblePatientStudies} subjectRef={historySubjectRef} source={patientHistoryResponse?.source ?? (backendPatientStudies.length ? "studies-index-no-longitudinal-model" : "no-longitudinal-backend-data")} summary={patientHistoryResponse?.summary} />)}
      {activeView === "settings" && <ProfessionalSettingsView user={session.user} onUserUpdated={(user) => setSession((current) => current ? { ...current, user } : current)} onLogout={logout} />}
      {activeView === "help" && <HelpSupportView />}
    </AppShell>
  );
}

export default App;
