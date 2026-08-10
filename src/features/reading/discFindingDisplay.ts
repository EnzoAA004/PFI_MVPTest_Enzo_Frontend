import type { DeploymentStatus, DiscFindingType } from "./discDegenerativeFindings";

/**
 * Cómo se nombran y cómo se presentan los hallazgos discales de P10.7.
 *
 * Separado del parser porque son dos preguntas distintas: qué dice el contrato, y qué le
 * mostramos al médico. La segunda tiene decisiones clínicas adentro.
 */

/** Etiquetas clínicas de presentación, sin mezclar el estado de despliegue. */
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
 * El estado se presenta separado del nombre para que se lea como advertencia y no
 * como parte de la variable clínica.
 */
export const DEPLOYMENT_LABELS: Record<DeploymentStatus, string> = {
  supported_internal: "Validado internamente",
  experimental: "Experimental",
  not_product_supported: "Investigación",
};

/**
 * Qué significa cada estado, para el aviso que acompaña al grupo.
 *
 * Habla de aciertos y no de métricas: "F1 0,125" no le dice nada a quien lee un estudio;
 * "acierta en una minoría de los casos" sí.
 *
 * El de `not_product_supported` explica además por qué no hay números al lado de las
 * etiquetas — que si no se lee como si faltara un dato, y no como una decisión.
 */
export const DEPLOYMENT_NOTES: Record<DeploymentStatus, string> = {
  supported_internal:
    "Evaluado sobre el conjunto interno del proyecto. No hay validación externa.",
  experimental:
    "El modelo acierta bastante por debajo de las tareas validadas. Se muestra para revisión, no para informar.",
  not_product_supported:
    "El modelo acierta en una minoría de los casos para estas variables. No se muestran "
    + "probabilidades porque describirían la confianza de cada predicción, no la calidad del "
    + "modelo. Se conservan solo para trazabilidad de investigación.",
};

/**
 * Si el hallazgo muestra sus probabilidades.
 *
 * **Las tareas `not_product_supported` muestran la etiqueta sin número.** Una barra de
 * probabilidad no comunica la calidad del modelo: dice cuán confiada está *esa* predicción.
 * Un 88 % sobre espondilolistesis —F1 0,125— se dibuja idéntico a un 88 % sobre
 * abombamiento, que acierta 6 de cada 7 veces, y al lado de una imagen del paciente los dos
 * se leen igual de convincentes.
 *
 * Es la misma razón por la que en modo demo no se muestra ningún hallazgo: cuando el número
 * no se puede sostener, mostrarlo con la estética de uno que sí se sostiene es peor que no
 * mostrarlo.
 *
 * Se consideró mostrarlo acompañado de la métrica de la tarea y se descartó: "F1 0,125" no
 * le dice nada a quien lee un estudio, y repetirlo por hallazgo convierte un panel de
 * lectura en un informe de entrenamiento.
 *
 * Esta distinción evita presentar confianza puntual como calidad global del modelo.
 */
export function showsProbabilities(status: DeploymentStatus): boolean {
  return status !== "not_product_supported";
}

/**
 * Si el grupo viene colapsado.
 *
 * Los hallazgos de investigación quedan colapsados por defecto: ocultarlos por completo
 * perdería trazabilidad y mezclarlos con los soportados exageraría su confiabilidad.
 *
 * Y es lo que sostiene la decisión de arriba: el número se muestra porque el rótulo del
 * grupo ya dijo qué clase de resultado es.
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
 * Aviso que gobierna la interpretación del panel; permanece visible antes de los hallazgos.
 */
export const DISC_FINDINGS_NOTICE =
  "Resultado generado por un modelo de investigación y sujeto a revisión profesional. "
  + "No constituye un diagnóstico clínico autónomo.";
