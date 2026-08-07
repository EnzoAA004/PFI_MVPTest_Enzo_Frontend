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

/**
 * Qué significa cada estado, para el aviso que acompaña al grupo.
 *
 * Es el único lugar donde se advierte sobre la calidad de la tarea, así que tiene que
 * alcanzar solo: las probabilidades se muestran en los tres estados, y este texto es lo
 * que le dice al médico bajo qué condición está leyendo el número que sigue.
 *
 * Por eso el de `not_product_supported` habla de aciertos y no de métricas. "F1 0,125" no
 * le dice nada a quien lee un estudio; "acierta en una minoría de los casos" sí.
 */
export const DEPLOYMENT_NOTES: Record<DeploymentStatus, string> = {
  supported_internal:
    "Evaluado sobre el conjunto interno del proyecto. No hay validación externa.",
  experimental:
    "El modelo acierta bastante por debajo de las tareas validadas. Se muestra para revisión, no para informar.",
  not_product_supported:
    "El modelo acierta en una minoría de los casos para estas variables. Las probabilidades "
    + "que siguen describen la confianza de cada predicción, no la calidad del modelo. Se "
    + "conservan para trazabilidad de investigación.",
};

/**
 * **Todos los hallazgos muestran sus probabilidades, incluidas las tareas de investigación.**
 *
 * Se evaluó esconder el número en las `not_product_supported` —un 88 % sobre
 * espondilolistesis, con F1 0,125, se dibuja idéntico a un 88 % sobre abombamiento, que
 * acierta 6 de cada 7 veces— y se descartó por dos razones.
 *
 * La primera es que esconderlo también es editorializar: se le saca un dato real a un
 * profesional asumiendo que lo va a leer mal.
 *
 * La segunda es que el contexto ya está, y ponerlo dos veces era resolver el mismo
 * problema por duplicado. Estos hallazgos no aparecen sueltos: viven dentro de un grupo
 * que arranca colapsado, rotulado "Investigación" y con su nota de alcance. El médico tuvo
 * que abrirlo para llegar al número.
 *
 * También se descartó acompañar cada probabilidad con la métrica de su tarea. "F1 0,125"
 * no le dice nada a quien lee un estudio, y repetirlo por hallazgo convierte un panel de
 * lectura en un informe de entrenamiento.
 *
 * La advertencia va una vez, en el grupo: ver {@link DEPLOYMENT_NOTES}.
 */

/**
 * Si el grupo viene colapsado.
 *
 * El handoff pide "ocultar por defecto o colocar en una sección de investigación". Se elige
 * colapsar y no ocultar: esconderlo del todo haría que el revisor no sepa que el modelo
 * también informó eso, y la trazabilidad de investigación es justamente lo que justifica
 * conservarlo.
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
 * El texto que acompaña a todo el panel, tal como lo pide el handoff §11.
 *
 * Va arriba y siempre, no al pie: es la condición bajo la cual se lee todo lo de abajo.
 */
export const DISC_FINDINGS_NOTICE =
  "Resultado generado por un modelo de investigación y sujeto a revisión profesional. "
  + "No constituye un diagnóstico clínico autónomo.";
