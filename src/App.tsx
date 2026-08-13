import { useEffect, useMemo, useRef, useState } from "react";
import { buildReviewCorrections, getHealth, getModels, getStudies, isDemoMode, normalizeRun, updateReview } from "./api";
import { logoutDoctor, updateDoctorSettings } from "./authClient";
import { hydrateAuthSession, loadAuthSession } from "./authStorage";
import { frontendLogger } from "./security/frontendLogger";
import { SESSION_INVALIDATED_EVENT, onCrossTabSessionSync } from "./security/sessionCleanup";
import { AppShell } from "./components/AppShell";
import { AuthView } from "./components/AuthView";
import { OnboardingTutorial } from "./components/OnboardingTutorial";
import { PatientDetailView } from "./components/PatientDetailView";
import { PatientsView } from "./components/PatientsView";
import { PendingApprovalView } from "./components/PendingApprovalView";
import { SettingsView } from "./features/settings/SettingsView";
import { StudyReviewView } from "./components/StudyReviewView";
import { Worklist } from "./features/worklist/Worklist";
import { deriveSummary, isReviewQueueItem, mergeStudyRowsWithSelectedRun, normalizeSelectedRunForReview, selectReviewableRunFromDetail, toSelectedStudyReference } from "./appDataGuards";
import { isDemoDataMode, validateVisibleDataOrigin } from "./dataMode";
import { appendBackendAudit, getBackendReviewSnapshot } from "./reviewPersistenceApi";
import { appendAuditEvent, loadReviewHistory, saveMeasurementEdits, saveProfessionalReview } from "./storage";
import { fetchStudyDetail } from "./studyApi";
import { studyHasReviewableRun } from "./studyDisplay";
import { useLocation, useNavigate } from "react-router-dom";
import { caseIdFromPath, pathForPatient, pathForStudy, pathForView, patientIdFromPath, viewForPath } from "./routes";
import type { AiModel, AiRunResponse, AuditEvent, AuthSession, Measurement, ReviewStatus, SelectedStudyReference, StudiesSummary, StudyDetailResponse, StudyRow, ViewKey } from "./appTypes";

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

function ContractErrorState({ detail, onBackToStudies }: { detail: string; onBackToStudies: () => void }) {
  return (
    <section className="panel-card clinical-empty-state" role="alert">
      <h2>Respuesta incompatible con el contrato</h2>
      <p>{detail}</p>
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

function apiErrorDetail(error: unknown) {
  if (!error || typeof error !== "object") return error instanceof Error ? error.message : "Error desconocido";
  const record = error as Record<string, unknown>;
  const message = error instanceof Error ? error.message : typeof record.message === "string" ? record.message : "Error desconocido";
  const code = typeof record.code === "string" ? record.code : undefined;
  const traceId = typeof record.traceId === "string" ? record.traceId : undefined;
  return [code ? `code=${code}` : undefined, message, traceId ? `traceId=${traceId}` : undefined].filter(Boolean).join(" · ");
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [authBootstrapping, setAuthBootstrapping] = useState(true);
  /*
   * La URL es la fuente de verdad de la navegación: `activeView` se deriva de
   * ella, no al revés. Eso es lo que hace que el botón atrás funcione, que
   * recargar mantenga la pantalla y que un caso se pueda compartir por link.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const activeView: ViewKey = viewForPath(location.pathname);
  const routeCaseId = caseIdFromPath(location.pathname);
  const [lastStudyNavView, setLastStudyNavView] = useState<"studies" | "queue">("studies");
  const [health, setHealth] = useState("consultando");
  const [models, setModels] = useState<AiModel[]>([]);
  const [backendStudies, setBackendStudies] = useState<StudyRow[]>([]);
  const [studiesBackendAvailable, setStudiesBackendAvailable] = useState(false);
  const [backendStatus, setBackendStatus] = useState("idle");
  const [databaseDataStatus, setDatabaseDataStatus] = useState("idle");
  const [aiModuleStatus, setAiModuleStatus] = useState("idle");
  const [reviewSnapshotStatus, setReviewSnapshotStatus] = useState("idle");
  const [studiesError, setStudiesError] = useState("");
  const [selectedStudy, setSelectedStudy] = useState<SelectedStudyReference | null>(null);
  /*
   * Detalle persistido del estudio abierto. Vive acá y viaja por props: antes iba
   * por sessionStorage con un evento de window, un canal fuera de React que hacía
   * que la sala de lectura no supiera de quién era el dato que estaba leyendo.
   */
  const [selectedDetail, setSelectedDetail] = useState<StudyDetailResponse | null>(null);
  /*
   * Caso cuyo detalle ya se pidió. Va en una ref y no en el estado porque el
   * efecto de deep link lo escribiría dentro de sí mismo: al depender del estado
   * que actualiza, se volvía a ejecutar, su cleanup cancelaba el fetch en vuelo y
   * la pantalla quedaba en "Cargando corrida" para siempre.
   */
  const requestedCaseIdRef = useRef<string | undefined>(undefined);
  const [studiesSummary, setStudiesSummary] = useState<StudiesSummary | undefined>();
  const [selectedRun, setSelectedRun] = useState<AiRunResponse | null>(null);
  const [studyReview, setStudyReview] = useState<any | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(Boolean(loadAuthSession()));
  const [saving, setSaving] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [bootstrapRetryNonce, setBootstrapRetryNonce] = useState(0);

  const reviewRunState = useMemo(() => normalizeSelectedRunForReview(selectedRun, isDemoDataMode, normalizeRun), [selectedRun]);
  const safeRun = reviewRunState.safeRun;
  const contractIssue = reviewRunState.contractIssue;
  const studies = useMemo(() => {
    return mergeStudyRowsWithSelectedRun(backendStudies, safeRun);
  }, [backendStudies, safeRun]);
  const shouldShowDataLoading = databaseDataStatus === "loading" && backendStudies.length === 0;
  const realStudyRows = studiesBackendAvailable ? studies : [];
  const reviewQueueCount = realStudyRows.filter(isReviewQueueItem).length;
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
    setStudiesError("");
    setSelectedRun(isDemoDataMode && stored.runs[0] ? stored.runs[0] : null);
    setMeasurements([]);
    setBackendStatus("loading");
    setDatabaseDataStatus("loading");
    setAiModuleStatus("loading");
    setReviewSnapshotStatus("loading");

    async function bootstrap() {
      const [healthResult, modelResult, studyResult, snapshotResult] = await Promise.allSettled([
        getHealth(),
        getModels(),
        getStudies(),
        isDemoDataMode ? getBackendReviewSnapshot() : Promise.resolve(null),
      ]);
      if (cancelled) return;

      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value.status ?? "sin_estado");
        setAiModuleStatus("ready");
      } else {
        setHealth("no_disponible");
        setAiModuleStatus("error");
      }

      if (modelResult.status === "fulfilled") {
        setModels(modelResult.value);
      } else {
        setModels([]);
        setAiModuleStatus("error");
      }

      if (studyResult.status === "fulfilled") {
        const studyResponse = studyResult.value;
        setBackendStatus("ready");
        setStudiesBackendAvailable(studyResponse.status !== "demo");
        setBackendStudies(studyResponse.items);
        setStudiesSummary(studyResponse.summary ?? deriveSummary(studyResponse.items));
        setDatabaseDataStatus(studyResponse.items.length ? "ready" : "empty");
        studyResponse.items.forEach((study) => validateVisibleDataOrigin(`estudio ${study.caseId}`, study.dataOrigin));
      } else {
        const detail = studyResult.reason instanceof Error ? studyResult.reason.message : "Error desconocido";
        setBackendStatus("error");
        setDatabaseDataStatus("error");
        setBackendStudies([]);
        setStudiesBackendAvailable(false);
        setStudiesError(`Error al consultar estudios. Detalle: ${detail}`);
      }

      setStudyReview(null);
      if (!isDemoDataMode) {
        setReviewSnapshotStatus("idle");
      } else if (snapshotResult.status === "fulfilled") {
        setReviewSnapshotStatus("ready");
        if (snapshotResult.value?.auditTrail?.length) setAuditTrail(snapshotResult.value.auditTrail);
      } else {
        setReviewSnapshotStatus("error");
      }

      setBootstrapLoading(false);
    }

    void bootstrap();
    return () => { cancelled = true; };
  }, [bootstrapRetryNonce, session, pendingApproval]);

  useEffect(() => {
    if (!contractIssue) return;
    frontendLogger.error("[contract] Respuesta incompatible con el contrato", {
      message: contractIssue.message,
      code: contractIssue.code,
      path: contractIssue.path,
      traceId: contractIssue.traceId,
    });
  }, [contractIssue]);

  function recordAudit(action: string, detail: string, actor = "Revisor") {
    setAuditTrail(appendAuditEvent({ action, detail, actor }));
    if (session) void appendBackendAudit(actor, action, detail).catch(() => undefined);
  }

  function resetProtectedState() {
    setBackendStudies([]);
    setStudiesSummary(undefined);
    setSelectedRun(null);
    setStudyReview(null);
    setMeasurements([]);
    setAuditTrail([]);
    setSelectedStudy(null);
    setStudiesError("");
    setReviewError("");
    setError("");
    setInfo("");
  }

  function logout() {
    void logoutDoctor().finally(() => {
      setSession(null);
      resetProtectedState();
    });
  }

  // A session invalidated in the background (failed refresh) or a logout in
  // another tab must close this tab's session too — no clinical data may
  // remain reachable once the session is gone anywhere (P10-C.1 §3/§4).
  useEffect(() => {
    function handleSessionLost() {
      setSession(null);
      resetProtectedState();
    }
    window.addEventListener(SESSION_INVALIDATED_EVENT, handleSessionLost);
    const unsubscribeCrossTab = onCrossTabSessionSync(handleSessionLost);
    return () => {
      window.removeEventListener(SESSION_INVALIDATED_EVENT, handleSessionLost);
      unsubscribeCrossTab();
    };
  }, []);

  function changeView(view: ViewKey) {
    if (view === "studies" || view === "queue") setLastStudyNavView(view);
    navigate(pathForView(view));
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
    if (!studyHasReviewableRun(study)) {
      setReviewError("El estudio no tiene una corrida persistida para revisar.");
      setSelectedRun(null);
      setSelectedStudy(toSelectedStudyReference(study));
      navigate(pathForStudy(study.caseId));
      return;
    }
    if (activeView === "studies" || activeView === "queue") setLastStudyNavView(activeView);
    requestedCaseIdRef.current = study.caseId;
    setSelectedStudy(toSelectedStudyReference(study));
    setSelectedDetail(null);
    setSelectedRun(null);
    setMeasurements([]);
    setStudyReview(null);
    setReviewError("");
    setReviewLoading(true);
    navigate(pathForStudy(study.caseId));
    void fetchStudyDetail(study).then((detail) => {
      setSelectedDetail(detail);
      if (detail.measurements?.length) setMeasurements(detail.measurements);
      const reviewableRun = selectReviewableRunFromDetail(detail);
      if (!reviewableRun) {
        setReviewError("El estudio no tiene corridas persistidas.");
        setSelectedRun(null);
        return;
      }
      setSelectedRun(reviewableRun);
    }).catch((detailError) => {
      const detail = detailError instanceof Error ? detailError.message : "Error desconocido";
      setReviewError(`No se pudo cargar el detalle del estudio. Detalle: ${detail}`);
    }).finally(() => {
      setReviewLoading(false);
    });
  }

  /*
   * Deep link a /estudio/:caseId.
   *
   * Al entrar por URL —link compartido, recarga, botón atrás— no hubo clic en
   * ninguna fila, así que no hay estudio seleccionado y hay que resolverlo desde
   * el caseId. Solo actúa cuando la ruta pide un caso distinto del que ya está
   * cargado; si no, cada render volvería a pedir el mismo detalle.
   */
  useEffect(() => {
    if (!session || !routeCaseId || requestedCaseIdRef.current === routeCaseId) return;
    requestedCaseIdRef.current = routeCaseId;
    let cancelled = false;
    setSelectedStudy({ caseId: routeCaseId } as SelectedStudyReference);
    setSelectedDetail(null);
    setSelectedRun(null);
    setMeasurements([]);
    setStudyReview(null);
    setReviewError("");
    setReviewLoading(true);
    void fetchStudyDetail({ caseId: routeCaseId }).then((detail) => {
      if (cancelled) return;
      setSelectedDetail(detail);
      if (detail.measurements?.length) setMeasurements(detail.measurements);
      const reviewableRun = selectReviewableRunFromDetail(detail);
      if (!reviewableRun) {
        setReviewError("El estudio no tiene corridas persistidas.");
        setSelectedRun(null);
        return;
      }
      setSelectedRun(reviewableRun);
    }).catch((detailError) => {
      if (cancelled) return;
      const detail = detailError instanceof Error ? detailError.message : "Error desconocido";
      setReviewError(`No se pudo cargar el estudio ${routeCaseId}. Detalle: ${detail}`);
    }).finally(() => {
      if (!cancelled) setReviewLoading(false);
    });
    return () => { cancelled = true; };
  }, [routeCaseId, session]);

  const routePatientId = patientIdFromPath(location.pathname);

  function handleMeasurementsChange(nextMeasurements: Measurement[], detail: string) {
    const runId = safeRun?.runId;
    if (!runId) {
      setError("No hay una corrida real seleccionada para guardar mediciones.");
      return;
    }
    setMeasurements(nextMeasurements);
    if (isDemoDataMode) saveMeasurementEdits(runId, nextMeasurements);
    recordAudit("medicion editada", detail);
  }

  async function handleViewSavedAnalysis(caseId: string) {
    const response = await refreshStudiesFromPostgres();
    const study = response.items.find((item) => item.caseId === caseId);
    if (!study) {
      setInfo("La revisión fue guardada, pero el estudio todavía no aparece en la lista.");
      changeView("studies");
      return;
    }
    handleOpenReview(study);
  }

  async function refreshStudiesFromPostgres() {
    const studyResponse = await getStudies();
    setStudiesBackendAvailable(studyResponse.status !== "demo");
    setBackendStudies(studyResponse.items);
    setStudiesSummary(studyResponse.summary ?? deriveSummary(studyResponse.items));
    setDatabaseDataStatus(studyResponse.items.length ? "ready" : "empty");
    setStudiesError("");
    return studyResponse;
  }

  async function refreshSelectedStudyFromPostgres() {
    if (!selectedStudy) return;
    const detail = await fetchStudyDetail({ caseId: selectedStudy.caseId });
    setSelectedDetail(detail);
    setMeasurements(detail.measurements ?? []);
    const reviewableRun = selectReviewableRunFromDetail(detail);
    if (reviewableRun) setSelectedRun(reviewableRun);
  }

  async function handleSaveReview(status: ReviewStatus, notes: string, reviewMeasurements: Measurement[]) {
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
      const confirmedCorrections = buildReviewCorrections(reviewMeasurements, trimmedNotes).length;
      const review = await updateReview(runId, { status, notes: trimmedNotes, observations: trimmedNotes, reviewer: session?.user.fullName ?? "Revisor", measurements: reviewMeasurements });
      if (isDemoDataMode) saveProfessionalReview(runId, review);
      await refreshStudiesFromPostgres();
      await refreshSelectedStudyFromPostgres();
      recordAudit(status === "aceptado" ? "estado aprobado" : status === "observado" ? "estado observado" : "revision guardada", `Revision ${status} guardada para ${runId}. Correcciones confirmadas: ${confirmedCorrections}.`);
      const statusMessage = status === "pendiente"
        ? "Borrador guardado correctamente."
        : status === "aceptado"
          ? "Estudio finalizado y aprobado por el revisor."
          : status === "observado"
            ? "Estudio marcado como observado."
            : "Estudio descartado por el revisor.";
      setInfo(isDemoMode() ? "Revision guardada en modo demo local porque el backend no confirmo la operacion." : `${statusMessage} Correcciones confirmadas: ${confirmedCorrections}.`);
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
        setInfo("No se pudo confirmar el PUT canonico en backend; revision guardada localmente en modo demo.");
        return fallbackReview;
      }
      const detail = apiErrorDetail(reviewError);
      setError(`No se pudo guardar la revision en backend. Detalle: ${detail}`);
      return undefined;
    } finally { setSaving(false); }
  }

  async function handleStudyMetadataUpdated() {
    await refreshStudiesFromPostgres();
    await refreshSelectedStudyFromPostgres();
  }

  // "dashboard", "studies" and "queue" all resolve to the single worklist; the old
  // keys stay valid so existing navigation calls keep working while the redesign
  // migrates screen by screen.
  const isWorklistView = activeView === "dashboard" || activeView === "studies" || activeView === "queue";
  const worklistNavView: ViewKey = isWorklistView || activeView === "review" ? "dashboard" : activeView === "history" ? "patients" : activeView;

  if (authBootstrapping) return <LoadingState title="Restaurando sesión" detail="Validando credenciales guardadas." />;
  if (!session) return <AuthView onAuthenticated={setSession} />;
  if (pendingApproval) return <PendingApprovalView session={session} onLogout={logout} />;

  return (
    <AppShell activeView={activeView} activeNavView={worklistNavView} onChangeView={changeView} health={health} modelCount={models.length} aiModuleAvailable={safeRun?.aiModuleAvailable ?? false} degradedMode={safeRun?.degradedMode ?? false} currentRunId={safeRun?.runId} userName={session.user.fullName} onLogout={logout} reviewQueueCount={reviewQueueCount}>
      {needsOnboarding && <OnboardingTutorial saving={onboardingSaving} onComplete={() => void completeOnboarding()} />}
      {error && (
        <div className="toast error app-error-toast" role="alert">
          <span>{error}</span>
          <button className="ghost-button" onClick={retryBootstrap} type="button">Reintentar</button>
        </div>
      )}
      {studiesError && (
        <div className="toast error app-error-toast" role="alert">
          <span>{studiesError}</span>
          <button className="ghost-button" onClick={retryBootstrap} type="button">Reintentar</button>
        </div>
      )}
      {databaseDataStatus === "empty" && <div className="toast info">Sin estudios persistidos.</div>}
      {aiModuleStatus === "error" && <div className="toast warning">AI Module no disponible. Los estudios persistidos siguen visibles si PostgreSQL responde.</div>}
      {reviewSnapshotStatus === "error" && <div className="toast warning">No se pudo consultar el snapshot de revisión; no bloquea la lista de trabajo.</div>}
      {info && <div className="toast info">{info}</div>}
      {isWorklistView && <Worklist studies={realStudyRows} loading={shouldShowDataLoading} onOpenReview={handleOpenReview} onAnalysisReady={handleViewSavedAnalysis} />}
      {activeView === "review" && (reviewLoading ? <LoadingState title="Cargando corrida" detail={`Consultando corridas persistidas para ${selectedStudy?.caseId ?? "el estudio seleccionado"}.`} /> : contractIssue ? <ContractErrorState detail={`${contractIssue.message}${contractIssue.path ? ` (${contractIssue.path})` : ""}${contractIssue.traceId ? ` · trace ${contractIssue.traceId}` : ""}`} onBackToStudies={() => changeView(lastStudyNavView)} /> : reviewError ? <ContractErrorState detail={reviewError} onBackToStudies={() => changeView(lastStudyNavView)} /> : safeRun ? <StudyReviewView run={safeRun} studyReview={studyReview} measurements={measurements} auditTrail={auditTrail} saving={saving} onBackToStudies={() => changeView(lastStudyNavView)} onMeasurementsChange={handleMeasurementsChange} onSaveReview={handleSaveReview} onStudyMetadataUpdated={handleStudyMetadataUpdated} selectedDetail={selectedDetail} /> : <EmptyReviewState onBackToStudies={() => changeView(lastStudyNavView)} />)}
      {activeView === "patients" && <PatientsView onOpenPatient={(patientId) => navigate(pathForPatient(patientId))} />}
      {activeView === "history" && <PatientDetailView patientId={routePatientId ?? ""} onBack={() => navigate(pathForView("patients"))} onOpenStudy={(caseId) => navigate(pathForStudy(caseId))} />}
      {activeView === "settings" && <SettingsView user={session.user} onUserUpdated={(user) => setSession((current) => current ? { ...current, user } : current)} onLogout={logout} />}
    </AppShell>
  );
}

export default App;
