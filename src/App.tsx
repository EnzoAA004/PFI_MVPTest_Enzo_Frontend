import "./theme.css";
import "./mri-theme.css";
import { useEffect, useMemo, useState } from "react";
import { getHealth, getModels, isDemoMode, normalizeRun, runPipeline, updateReview } from "./api";
import { clearAuthSession, loadAuthSession } from "./authStorage";
import { AppShell } from "./components/AppShell";
import { AuthView } from "./components/AuthView";
import { DashboardView } from "./components/DashboardView";
import { PatientHistoryView } from "./components/PatientHistoryView";
import { StudyReviewView } from "./components/StudyReviewView";
import { initialAuditTrail, patientStudies, worklistStudies } from "./data/mockStudies";
import { sampleRun } from "./mock/sampleRun";
import {
  appendAuditEvent,
  loadReviewHistory,
  saveMeasurementEdits,
  saveProfessionalReview,
  saveRun,
} from "./storage";
import type { AiModel, AiRunResponse, AuditEvent, AuthSession, Measurement, ReviewStatus, ViewKey } from "./appTypes";

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [health, setHealth] = useState("consultando");
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedRun, setSelectedRun] = useState<AiRunResponse>(() => normalizeRun(sampleRun));
  const [measurements, setMeasurements] = useState<Measurement[]>(() => normalizeRun(sampleRun).normalizedMeasurements ?? []);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>(initialAuditTrail);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const safeRun = useMemo(() => normalizeRun(selectedRun), [selectedRun]);
  const history = useMemo(() => loadReviewHistory(), [auditTrail, selectedRun]);
  const studies = useMemo(() => {
    const first = worklistStudies[0];
    return [
      {
        ...first,
        caseId: safeRun.caseId ?? first.caseId,
        plane: safeRun.plane ?? first.plane,
        modelKey: safeRun.modelKey ?? first.modelKey,
        modelStatus:
          safeRun.measurementsStatus === "pending_real_inference"
            ? "Pipeline tecnico / inferencia pendiente"
            : safeRun.degradedMode
              ? "Modo degradado"
              : "AI-ready",
        reviewStatus: safeRun.review?.status ?? first.reviewStatus,
        priority: safeRun.agentDecision?.priority ?? first.priority,
      },
      ...worklistStudies.slice(1),
    ];
  }, [safeRun]);

  useEffect(() => {
    if (!session) return;
    const stored = loadReviewHistory();
    setAuditTrail(stored.auditTrail.length > 0 ? stored.auditTrail : initialAuditTrail);

    const normalized = normalizeRun(stored.runs[0] ?? sampleRun);
    const runId = normalized.runId ?? "demo-run-2026-001";
    const storedMeasurements = stored.measurementsByRunId[runId];
    const storedReview = stored.reviewsByRunId[runId];
    setSelectedRun(storedReview ? { ...normalized, review: storedReview } : normalized);
    setMeasurements(storedMeasurements ?? normalized.normalizedMeasurements ?? []);

    async function bootstrap() {
      try {
        const [healthResponse, modelResponse] = await Promise.all([getHealth(), getModels()]);
        setHealth(healthResponse.status ?? "sin_estado");
        setModels(modelResponse);
      } catch (bootstrapError) {
        setError(bootstrapError instanceof Error ? bootstrapError.message : "No se pudo consultar el backend");
      }
    }

    void bootstrap();
  }, [session]);

  function recordAudit(action: string, detail: string, actor = "Reviewer") {
    setAuditTrail(appendAuditEvent({ action, detail, actor }));
  }

  function logout() {
    clearAuthSession();
    setSession(null);
  }

  async function handleRunDemo() {
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const response = await runPipeline({
        caseId: sampleRun.caseId ?? "CASE-DEMO-0142",
        plane: sampleRun.plane ?? "sagittal",
        modelKey: "sagittal_spider",
        inputPath: "demo/CASE-DEMO-0142",
        metadata: {
          source: "frontend-review-workspace",
          uiVersion: "redesign-v1",
          frontendBaseUrl: window.location.origin,
        },
      });
      const normalized = normalizeRun(response);
      setSelectedRun(normalized);
      setMeasurements(normalized.normalizedMeasurements ?? []);
      saveRun(normalized);
      recordAudit("pipeline run generado", `${normalized.caseId} ejecutado. Run ID ${normalized.runId}.`, "System");
      recordAudit("reporte agente recuperado", "Respuesta normalizada para revision profesional.", "AI Agent");
      if (isDemoMode()) setInfo("Modo demo local activo o fallback aplicado. La interfaz conserva el flujo de revision.");
      else setInfo("Caso demo ejecutado contra el backend. La respuesta se muestra como salida tecnica revisable.");
      setActiveView("review");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "No se pudo ejecutar el caso demo");
    } finally {
      setLoading(false);
    }
  }

  function handleMeasurementsChange(nextMeasurements: Measurement[], detail: string) {
    const runId = safeRun.runId ?? "local-run";
    setMeasurements(nextMeasurements);
    saveMeasurementEdits(runId, nextMeasurements);
    recordAudit("medicion editada", detail);
  }

  async function handleSaveReview(status: ReviewStatus, notes: string) {
    setSaving(true);
    setError("");
    setInfo("");
    const runId = safeRun.runId ?? "local-run";
    try {
      const review = await updateReview(runId, {
        status,
        notes,
        observations: notes,
        reviewer: session?.user.fullName ?? "Reviewer",
      });
      setSelectedRun((current) => ({ ...current, review }));
      saveProfessionalReview(runId, review);
      recordAudit(status === "aceptado" ? "estado aprobado" : status === "observado" ? "estado observado" : "revision guardada", `Revision ${status} guardada para ${runId}.`);
      if (isDemoMode()) setInfo("Revision guardada en modo demo local porque el backend no confirmo la operacion.");
      else setInfo("Revision guardada correctamente en el backend.");
      return review;
    } catch {
      const fallbackReview = {
        runId,
        status,
        notes,
        observations: notes,
        reviewer: session?.user.fullName ?? "Reviewer",
        updatedAt: new Date().toISOString(),
      };
      setSelectedRun((current) => ({ ...current, review: fallbackReview }));
      saveProfessionalReview(runId, fallbackReview);
      recordAudit("revision guardada", `Fallback local aplicado para ${runId}.`);
      setInfo("No se pudo confirmar el PATCH en backend; revision guardada localmente.");
      return fallbackReview;
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return <AuthView onAuthenticated={setSession} />;
  }

  return (
    <AppShell
      activeView={activeView}
      onChangeView={setActiveView}
      health={health}
      modelCount={models.length}
      aiModuleAvailable={safeRun.aiModuleAvailable}
      degradedMode={safeRun.degradedMode}
      onRunDemo={handleRunDemo}
      loading={loading}
      userName={session.user.fullName}
      onLogout={logout}
    >
      {error && <div className="toast error">{error}</div>}
      {info && <div className="toast info">{info}</div>}
      {activeView === "dashboard" && (
        <DashboardView studies={studies} auditTrail={auditTrail} onOpenReview={() => setActiveView("review")} />
      )}
      {activeView === "review" && (
        <StudyReviewView
          run={safeRun}
          measurements={measurements}
          auditTrail={auditTrail}
          saving={saving}
          onMeasurementsChange={handleMeasurementsChange}
          onSaveReview={handleSaveReview}
        />
      )}
      {activeView === "history" && <PatientHistoryView studies={history.patientStudies.length ? history.patientStudies : patientStudies} />}
    </AppShell>
  );
}

export default App;
