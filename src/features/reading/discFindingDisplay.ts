import type { DeploymentStatus, DiscFindingType } from "./discDegenerativeFindings";

/**
 * Cómo se nombran y cómo se presentan los hallazgos discales de P10.7.
 *
 * Separado del parser porque son dos preguntas distintas: qué dice el contrato, y qué le
 * mostramos al médico. La segunda tiene decisiones clínicas adentro.
 */

/** Traducciones del handoff de P10.7 §11, sin el sufijo de estado. */
export const DISC_FINDING_LABELS: Record<DiscFindingType, string> = {
  disc_bulging: "Abombamiento discal",
  disc_narrowing: "Estrechamiento discal",
  upper_endplate_change: "Cambio del platillo superior",
  lower_endplate_change: "Cambio del platillo inferior",
  pfirrmann_grade: "Grado de Pfirrmann",
  modic_change: "Cambio Modic",
  disc_herniation: "Hernia discal",
  spondylolisthesis: "Espondilolistesis",
};

/**
 * El sufijo va aparte del nombre y no pegado.
 *
 * El handoff sugiere "Grado de Pfirrmann — experimental" como una sola cadena. Se separa
 * para que el estado pueda pintarse distinto del nombre: leído en la misma tipografía, se
 * lee como parte del nombre de la variable y deja de advertir nada.
 */
export const DEPLOYMENT_LABELS: Record<DeploymentStatus, string> = {
  supported_internal: "Validado internamente",
  experimental: "Experimental",
  not_product_supported: "Investigación",
};

/** Qué significa cada estado, para el aviso que acompaña al grupo. */
export const DEPLOYMENT_NOTES: Record<DeploymentStatus, string> = {
  supported_internal:
    "Evaluado sobre el conjunto interno del proyecto. No hay validación externa.",
  experimental:
    "El modelo acierta bastante por debajo de las tareas validadas. Se muestra para revisión, no para informar.",
  not_product_supported:
    "Rendimiento insuficiente para orientar una lectura. Se conserva solo para trazabilidad de investigación.",
};

/**
 * Si el hallazgo muestra sus probabilidades.
 *
 * **Las tareas de investigación no muestran barra, solo la etiqueta.** Una barra de
 * probabilidad no comunica la calidad del modelo: dice cuán confiada está *esa* predicción.
 * Un 88 % sobre una tarea con F1 0,125 —espondilolistesis— se dibuja idéntico a un 88 %
 * sobre una con F1 0,846, y al lado de una imagen del paciente los dos se leen igual de
 * convincentes.
 *
 * Es la misma razón por la que en modo demo no se muestra ningún hallazgo: cuando el número
 * no se puede sostener, mostrarlo con la estética de uno que sí se sostiene es peor que no
 * mostrarlo.
 */
export function showsProbabilities(status: DeploymentStatus): boolean {
  return status !== "not_product_supported";
}

/**
 * Si el grupo viene colapsado.
 *
 * El handoff pide "ocultar por defecto o colocar en una sección de investigación". Se elige
 * colapsar y no ocultar: esconderlo del todo haría que el revisor no sepa que el modelo
 * también informó eso, y la trazabilidad de investigación es justamente lo que justifica
 * conservarlo.
 */
export function startsCollapsed(status: DeploymentStatus): boolean {
  return status === "not_product_supported";
}

/** Orden de presentación: primero lo que se puede sostener. */
export const DEPLOYMENT_ORDER: DeploymentStatus[] = [
  "supported_internal",
  "experimental",
  "not_product_supported",
];

/**
 * El texto que acompaña a todo el panel, tal como lo pide el handoff §11.
 *
 * Va arriba y siempre, no al pie: es la condición bajo la cual se lee todo lo de abajo.
 */
export const DISC_FINDINGS_NOTICE =
  "Resultado generado por un modelo de investigación y sujeto a revisión profesional. "
  + "No constituye un diagnóstico clínico autónomo.";
