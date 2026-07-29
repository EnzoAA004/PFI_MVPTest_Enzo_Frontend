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

/** One DICOM series detected inside an uploaded study zip. */
export type StudySeriesInfo = {
  seriesInstanceUid: string;
  description: string;
  plane: "sagittal" | "axial" | "coronal" | null;
  weighting: string;
  sliceCount: number;
};

/** A series that was selected and registered as a per-plane input. */
export type StudyPlaneInput = InputResponse & {
  seriesInstanceUid: string;
  description: string;
  weighting: string;
  sliceCount: number;
};

/**
 * DTO for POST /api/ai/studies: the AI module classifies every series in the zip
 * and returns the chosen sagittal/axial inputs plus the full detected list.
 */
export type StudyIngestionResponse = {
  caseId: string;
  studyId: string;
  seriesFound: StudySeriesInfo[];
  warnings: string[];
  sagittal?: StudyPlaneInput;
  axial?: StudyPlaneInput;
};
