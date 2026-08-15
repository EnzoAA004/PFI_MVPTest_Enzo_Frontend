/**
 * Tema de la superficie operativa: lista de trabajo, pacientes, cargador,
 * configuración y acceso.
 *
 * Sólo hay dos valores y el atributo vive en <html>:
 *
 *   data-theme="clinical"  superficie oscura, la misma familia que el visor
 *   (sin atributo)         superficie clara, que es la paleta base de :root
 *
 * La sala de lectura **no participa**: declara `data-theme="reading"` sobre sí
 * misma y, al estar anidada, gana siempre. Una sala de lectura es una sala
 * oscura —sobre un fondo claro el ojo se adapta a la interfaz en vez de a la
 * imagen, y eso aplana el contraste percibido del estudio—, así que no es una
 * preferencia que tenga sentido ofrecer ahí.
 *
 * El atributo se escribe antes del primer pintado desde un script en línea en
 * index.html; este módulo comparte con él la clave y la lógica de resolución
 * para que no puedan divergir.
 */
export type OperationsTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "pfi.theme";

/** Preferencia guardada, o `null` si quien usa el sistema nunca eligió. */
export function storedTheme(): OperationsTheme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    // El almacenamiento puede estar deshabilitado; se cae a la preferencia del sistema.
    return null;
  }
}

/**
 * Sin elección explícita se sigue al sistema operativo. El fallback es oscuro
 * porque es el que comparte lenguaje con el visor, que es donde transcurre el
 * trabajo real.
 */
export function resolveTheme(): OperationsTheme {
  const stored = storedTheme();
  if (stored) return stored;
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: OperationsTheme) {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-theme", "clinical");
  else root.removeAttribute("data-theme");
}

export function persistTheme(theme: OperationsTheme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sin almacenamiento la elección dura lo que dure la pestaña.
  }
}
