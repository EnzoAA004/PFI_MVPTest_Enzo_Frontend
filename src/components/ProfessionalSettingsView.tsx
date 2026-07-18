import { useEffect, useMemo, useState } from "react";
import { updateDoctorSettings } from "../authClient";
import type { AuthUser } from "../appTypes";
import { ToggleSwitch } from "./ToggleSwitch";

type PreferenceState = {
  language: string;
  density: string;
  notifications: boolean;
};

const LOCAL_SETTINGS_KEY = "lumbar-mri-professional-settings-v1";

interface ProfessionalSettingsViewProps {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => void;
}

function loadLocalPreferences(): PreferenceState {
  try {
    const raw = window.localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return { language: "es", density: "comfortable", notifications: false };
    return { language: "es", density: "comfortable", notifications: false, ...JSON.parse(raw) } as PreferenceState;
  } catch {
    return { language: "es", density: "comfortable", notifications: false };
  }
}

export function ProfessionalSettingsView({ user, onUserUpdated, onLogout }: ProfessionalSettingsViewProps) {
  const [preferences, setPreferences] = useState<PreferenceState>(() => loadLocalPreferences());
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(user.twoFactorEnabled));
  const [savingTwoFactor, setSavingTwoFactor] = useState(false);
  const [message, setMessage] = useState("");
  const roles = useMemo(() => user.roles.length ? user.roles.join(", ") : "sin rol informado", [user.roles]);

  useEffect(() => {
    window.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(preferences));
  }, [preferences]);

  async function toggleTwoFactor() {
    const next = !twoFactorEnabled;
    setSavingTwoFactor(true);
    setMessage("");
    try {
      const updated = await updateDoctorSettings({ twoFactorEnabled: next });
      setTwoFactorEnabled(Boolean(updated.twoFactorEnabled));
      onUserUpdated(updated);
      setMessage("Seguridad actualizada en backend.");
    } catch {
      setTwoFactorEnabled(next);
      setMessage("No se pudo confirmar en backend; cambio visible localmente hasta la próxima sesión.");
    } finally {
      setSavingTwoFactor(false);
    }
  }

  return (
    <div className="view-stack professional-settings-view">
      <section className="page-heading compact-heading">
        <div>
          <p>Configuración</p>
          <h1>Configuración profesional</h1>
        </div>
        <div className="screen-summary">
          <strong>{user.fullName || "Profesional"}</strong>
          <span>Perfil y preferencias de sesión</span>
        </div>
      </section>

      {message && <div className="toast info" role="status">{message}</div>}

      <section className="settings-grid">
        <article className="panel-card compact-card settings-section">
          <div className="section-title"><h2>Perfil</h2><span>Lectura de sesión</span></div>
          <dl className="settings-details">
            <div><dt>Nombre</dt><dd>{user.fullName || "sin datos"}</dd></div>
            <div><dt>Rol</dt><dd>{roles}</dd></div>
            <div><dt>Matrícula / credencial</dt><dd>{user.licenseNumber || "sin datos"}</dd></div>
            <div><dt>Centro / institución</dt><dd>{user.institution || "sin datos"}</dd></div>
            <div><dt>Correo</dt><dd>{user.email}</dd></div>
          </dl>
          <p className="settings-persistence-note">Edición de perfil pendiente de endpoint backend. Los datos visibles vienen de la sesión autenticada.</p>
        </article>

        <article className="panel-card compact-card settings-section">
          <div className="section-title"><h2>Preferencias</h2><span>Guardado local</span></div>
          <div className="settings-form-grid">
            <label>
              <span>Idioma</span>
              <select value={preferences.language} onChange={(event) => setPreferences((current) => ({ ...current, language: event.target.value }))}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              <span>Densidad visual</span>
              <select value={preferences.density} onChange={(event) => setPreferences((current) => ({ ...current, density: event.target.value }))}>
                <option value="comfortable">Cómoda</option>
                <option value="compact">Compacta</option>
              </select>
            </label>
          </div>
          <ToggleSwitch checked={preferences.notifications} label="Notificaciones" description="Preferencia local. No hay backend de notificaciones en este ticket." onChange={() => setPreferences((current) => ({ ...current, notifications: !current.notifications }))} />
          <p className="settings-persistence-note">Preferencias guardadas en este navegador; persistencia backend pendiente.</p>
        </article>

        <article className="panel-card compact-card settings-section">
          <div className="section-title"><h2>Cuenta / sesión</h2><span>Seguridad</span></div>
          <ToggleSwitch checked={twoFactorEnabled} disabled={savingTwoFactor} label="Doble verificación" description="Este campo usa el endpoint existente de settings cuando el backend responde." onChange={() => void toggleTwoFactor()} />
          <div className="account-actions">
            <button className="ghost-button" disabled title="Cambio de contraseña pendiente de endpoint backend" type="button">Cambiar contraseña</button>
            <button className="ghost-button" onClick={onLogout} type="button">Cerrar sesión</button>
          </div>
          <p className="settings-persistence-note">Contraseña: pendiente backend. Cerrar sesión usa el flujo existente.</p>
        </article>
      </section>
    </div>
  );
}
