import { frontendLogger } from "./security/frontendLogger";

export type AppDataMode = "real" | "demo";
export type DataOrigin = "backend" | "ai_module" | "database" | "demo";

export const appDataMode: AppDataMode = import.meta.env.VITE_USE_MOCK === "true" ? "demo" : "real";
export const isDemoDataMode = appDataMode === "demo";
export const isRealDataMode = appDataMode === "real";

export function markDataOrigin<T extends Record<string, unknown>>(value: T, dataOrigin: DataOrigin): T & { dataOrigin: DataOrigin } {
  return { ...value, dataOrigin };
}

export function validateVisibleDataOrigin(label: string, dataOrigin?: DataOrigin | string) {
  if (isRealDataMode && dataOrigin === "demo") {
    frontendLogger.error(`[data-origin] ${label} intento renderizar datos demo con VITE_USE_MOCK=false.`);
  }
}
