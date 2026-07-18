import { useState } from "react";
import { createDemoDoctorSession, loginDoctor, registerDoctor, verifyLogin, verifyRegistration } from "../authClient";
import type { AuthPendingResponse, AuthSession, RegisterRequest } from "../appTypes";

interface AuthViewProps {
  onAuthenticated: (session: AuthSession) => void;
}

type Mode = "login" | "register";

type ChallengeState = {
  mode: Mode;
  challenge: AuthPendingResponse;
  email: string;
};

function isSession(value: AuthPendingResponse | AuthSession): value is AuthSession {
  return typeof (value as AuthSession).accessToken === "string";
}

export function AuthView({ onAuthenticated }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState<RegisterRequest>({
    fullName: "Dra. Demo Revisora",
    email: "doctor.demo@pfi.local",
    password: "Demo1234!",
    licenseNumber: "MN-DEMO-2026",
    specialty: "Radiologia / Columna lumbar",
    institution: "PFI Academic Lab",
  });
  const [challengeState, setChallengeState] = useState<ChallengeState | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function updateField(key: keyof RegisterRequest, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = mode === "register"
        ? await registerDoctor(form)
        : await loginDoctor(form.email, form.password);
      if (isSession(response)) {
        onAuthenticated(response);
        return;
      }
      if (!response.challengeId) {
        setMessage(response.message ?? "Solicitud recibida. Revisá el estado de la cuenta profesional.");
        return;
      }
      setChallengeState({ mode, challenge: response, email: form.email });
      setCode(response.devVerificationCode ?? "");
      setMessage(response.message ?? "Código de verificación generado.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo completar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (!challengeState?.challenge.challengeId) return;
    setLoading(true);
    setError("");
    try {
      const session = challengeState.mode === "register"
        ? await verifyRegistration(challengeState.challenge.challengeId, code)
        : await verifyLogin(challengeState.challenge.challengeId, code);
      onAuthenticated(session as AuthSession);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Codigo invalido o expirado");
    } finally {
      setLoading(false);
    }
  }

  async function startDemo() {
    setLoading(true);
    setError("");
    try {
      const session = await createDemoDoctorSession();
      onAuthenticated(session as AuthSession);
    } catch (demoError) {
      setError(demoError instanceof Error ? demoError.message : "No se pudo iniciar la sesión demo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">LM</div>
          <div>
            <strong>Plataforma de análisis de RM lumbar</strong>
            <span>Datos académicos deidentificados · Revisión humana requerida</span>
          </div>
        </div>
        <div className="auth-copy">
          <p>Secure doctor access</p>
          <h1>{mode === "register" ? "Registrar profesional" : "Ingresar como profesional"}</h1>
          <span>El acceso protege el flujo de revision, historial y endpoints del pipeline asistivo.</span>
        </div>
        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setChallengeState(null); }} type="button">Ingresar</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setChallengeState(null); }} type="button">Registro</button>
        </div>
        {!challengeState ? (
          <div className="auth-form">
            {mode === "register" && (
              <>
                <label>Nombre completo<input value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} /></label>
                <label>Matricula<input value={form.licenseNumber ?? ""} onChange={(event) => updateField("licenseNumber", event.target.value)} /></label>
                <label>Especialidad<input value={form.specialty ?? ""} onChange={(event) => updateField("specialty", event.target.value)} /></label>
                <label>Institucion<input value={form.institution ?? ""} onChange={(event) => updateField("institution", event.target.value)} /></label>
              </>
            )}
            <label>Correo profesional<input value={form.email} onChange={(event) => updateField("email", event.target.value)} /></label>
            <label>Contraseña<input type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} /></label>
            <button className="primary-button" disabled={loading} onClick={() => void submit()} type="button">{loading ? "Procesando..." : mode === "register" ? "Crear cuenta y verificar" : "Ingresar"}</button>
            <button className="ghost-button" disabled={loading} onClick={() => void startDemo()} type="button">Entrar con doctor demo</button>
          </div>
        ) : (
          <div className="auth-form">
            <div className="verification-panel">
              <strong>{challengeState.mode === "register" ? "Verificación de registro" : "Doble verificación"}</strong>
              <p>{message}</p>
              {challengeState.challenge.devVerificationCode && <span>Codigo demo: {challengeState.challenge.devVerificationCode}</span>}
            </div>
            <label>Codigo de 6 digitos<input value={code} onChange={(event) => setCode(event.target.value)} maxLength={6} /></label>
            <button className="primary-button" disabled={loading} onClick={() => void verify()} type="button">Verificar</button>
            <button className="ghost-button" onClick={() => setChallengeState(null)} type="button">Volver</button>
          </div>
        )}
        {message && !challengeState && <div className="toast info">{message}</div>}
        {error && <div className="toast error">{error}</div>}
      </section>
    </main>
  );
}
