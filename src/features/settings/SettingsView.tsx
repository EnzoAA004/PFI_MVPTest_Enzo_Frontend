import { useState } from "react";
import type { AuthUser } from "../../appTypes";
import { HelpSupportView } from "../../components/HelpSupportView";
import { ProfessionalSettingsView } from "../../components/ProfessionalSettingsView";

/**
 * Ajustes: preferencias del profesional y ayuda, en un solo destino.
 *
 * Eran dos entradas separadas en la navegación para dos pantallas que el médico
 * visita por el mismo motivo —configurar la herramienta o entender su alcance— y
 * casi nunca. Ocupaban dos de los lugares del menú que compiten con la lista de
 * trabajo y la lectura, que es donde realmente trabaja.
 */

type SettingsTab = "preferencias" | "ayuda";

type Props = {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => void;
};

export function SettingsView({ user, onUserUpdated, onLogout }: Props) {
  const [tab, setTab] = useState<SettingsTab>("preferencias");

  return (
    <div className="view-stack settings-view">
      <section className="page-heading compact-heading">
        <div>
          <p>Ajustes</p>
          <h1>Preferencias y ayuda</h1>
        </div>
      </section>

      {/* div y no nav: role="tablist" ya describe el patron, y un landmark de navegacion
          con rol de tablist encima le da al lector de pantalla dos semanticas en pugna. */}
      <div className="settings-tabs" role="tablist" aria-label="Secciones de ajustes">
        <button
          aria-selected={tab === "preferencias"}
          className={tab === "preferencias" ? "is-active" : ""}
          onClick={() => setTab("preferencias")}
          role="tab"
          type="button"
        >
          Preferencias
        </button>
        <button
          aria-selected={tab === "ayuda"}
          className={tab === "ayuda" ? "is-active" : ""}
          onClick={() => setTab("ayuda")}
          role="tab"
          type="button"
        >
          Ayuda y alcance
        </button>
      </div>

      {tab === "preferencias"
        ? <ProfessionalSettingsView user={user} onUserUpdated={onUserUpdated} onLogout={onLogout} />
        : <HelpSupportView />}
    </div>
  );
}
