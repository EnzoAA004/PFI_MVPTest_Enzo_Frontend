import type { Plane } from "../appTypes";

/**
 * DTO HTTP legítimo para POST /api/ai/inputs. No es dominio canónico de
 * corrida ni tipo legacy de MultiplanarRunResponse.
 */
export type InputResponse = {
  inputId: string;
  caseId: string;
  plane: Plane;
  format: string;
  size: number;
};
