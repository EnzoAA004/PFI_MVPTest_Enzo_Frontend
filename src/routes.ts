import type { ViewKey } from "./appTypes";

/**
 * Correspondencia entre las vistas de la app y URLs reales.
 *
 * Hasta acá la navegación vivía solo en estado de React: no había forma de
 * compartir un caso por link, el botón atrás del navegador salía de la app, y
 * recargar la página devolvía siempre a la lista. La URL es la fuente de verdad
 * de dónde está parado el médico; `activeView` se deriva de ella.
 *
 * `dashboard`, `studies` y `queue` resuelven a la misma lista de trabajo — son
 * claves heredadas que siguen valiendo para la navegación interna, pero comparten
 * una sola ruta porque son una sola pantalla.
 */
export const ROUTES = {
  worklist: "/worklist",
  study: "/estudio",
  patients: "/pacientes",
  settings: "/ajustes",
} as const;

const VIEW_TO_PATH: Record<ViewKey, string> = {
  dashboard: ROUTES.worklist,
  studies: ROUTES.worklist,
  queue: ROUTES.worklist,
  review: ROUTES.study,
  patients: ROUTES.patients,
  // El historial no es un destino aparte: es el detalle de Paciente.
  history: ROUTES.patients,
  settings: ROUTES.settings,
};

export function pathForView(view: ViewKey): string {
  return VIEW_TO_PATH[view] ?? ROUTES.worklist;
}

export function pathForStudy(caseId: string): string {
  return `${ROUTES.study}/${encodeURIComponent(caseId)}`;
}

/**
 * Vista que corresponde a una URL. Una ruta desconocida cae en la lista de
 * trabajo en vez de dejar la pantalla vacía: un link roto debe llevar a algún
 * lado usable, no a la nada.
 */
export function viewForPath(pathname: string): ViewKey {
  if (pathname.startsWith(ROUTES.study)) return "review";
  // Paciente es un solo destino con dos niveles: la lista y el detalle real de uno.
  if (pathname === ROUTES.patients || pathname === `${ROUTES.patients}/`) return "patients";
  if (pathname.startsWith(`${ROUTES.patients}/`)) return "history";
  if (pathname.startsWith(ROUTES.settings)) return "settings";
  return "dashboard";
}

/** URL del detalle de una entidad Patient persistida. */
export function pathForPatient(patientId: string): string {
  return `${ROUTES.patients}/${encodeURIComponent(patientId)}`;
}

/**
 * UUID técnico pedido por una URL de Patient, o undefined si la ruta es la lista.
 *
 * Un segmento mal escapado devuelve undefined en vez de lanzar: un link roto debe
 * caer en la lista de pacientes, no romper la navegación.
 */
export function patientIdFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith(`${ROUTES.patients}/`)) return undefined;
  const segments = pathname.slice(ROUTES.patients.length + 1).split("/").filter(Boolean);
  if (segments.length !== 1) return undefined;
  try {
    const patientId = decodeURIComponent(segments[0]);
    return patientId || undefined;
  } catch {
    return undefined;
  }
}

/** caseId de una URL `/estudio/:caseId`, o undefined si la ruta no lo trae. */
export function caseIdFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith(`${ROUTES.study}/`)) return undefined;
  const raw = pathname.slice(ROUTES.study.length + 1).split("/")[0];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}
