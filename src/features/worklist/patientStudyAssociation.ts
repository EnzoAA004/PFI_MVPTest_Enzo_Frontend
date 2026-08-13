import { BackendApiError } from "../../multiplanarApi";
import {
  associateStudyPatient,
  type StudyPatientAssignmentResponse,
} from "../../patientApi";

export type PatientAssociationResult =
  | { status: "associated"; response: StudyPatientAssignmentResponse }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

export async function associatePatientAfterAnalysis(
  caseId: string,
  patientId: string,
  associate: typeof associateStudyPatient = associateStudyPatient,
): Promise<PatientAssociationResult> {
  try {
    const response = await associate(caseId, {
      patientId,
      expectedPatientId: null,
      reason: "INITIAL_ASSIGNMENT",
    });
    return { status: "associated", response };
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 409) {
      return {
        status: "conflict",
        message: "Este estudio fue asociado a otro paciente mientras se procesaba.",
      };
    }
    return {
      status: "error",
      message: "Análisis completado, pero no se pudo asociar el estudio al paciente.",
    };
  }
}
