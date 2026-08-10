import type { DeploymentStatus, DiscFindingType } from "./discDegenerativeFindings";

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

export const DEPLOYMENT_LABELS: Record<DeploymentStatus, string> = {
  supported_internal: "Validación interna",
  experimental: "Experimental",
  not_product_supported: "Investigación",
};

export const DEPLOYMENT_NOTES: Record<DeploymentStatus, string> = {
  supported_internal:
    "Evaluado sobre el conjunto interno del proyecto. No cuenta con validación externa.",
  experimental:
    "Resultado experimental visible únicamente para revisión profesional.",
  not_product_supported:
    "Resultado de investigación. No es una capacidad soportada para producto y se conserva separada únicamente para análisis y trazabilidad.",
};

const DISC_FINDING_VALUE_LABELS: Record<string, string> = {
  present: "Presente",
  absent: "Ausente",
};

/** Traduce sólo la presentación; el valor contractual permanece intacto. */
export function displayDiscFindingValue(value: string): string {
  return DISC_FINDING_VALUE_LABELS[value] ?? value;
}

export function startsCollapsed(status: DeploymentStatus): boolean {
  return status === "not_product_supported";
}

export const DEPLOYMENT_ORDER: DeploymentStatus[] = [
  "supported_internal",
  "experimental",
  "not_product_supported",
];

export const DISC_FINDINGS_NOTICE =
  "Resultado generado por IA y sujeto a revisión profesional. No constituye un diagnóstico clínico autónomo.";
