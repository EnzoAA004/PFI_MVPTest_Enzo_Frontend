import type { Priority, StudyMetadataInput } from "./appTypes";

export type StudyMetadataDraft = {
  subjectRef: string;
  studyDate: string;
  modality: string;
  description: string;
  reviewPriority: "low" | "medium" | "high";
};

export const subjectRefErrorMessage = "La referencia debe ser un código de-identificado de entre 3 y 64 caracteres, sin espacios.";

export function priorityToBackend(priority?: Priority | "low" | "medium" | "high"): StudyMetadataInput["reviewPriority"] {
  if (priority === "alta" || priority === "high") return "high";
  if (priority === "baja" || priority === "low") return "low";
  return "medium";
}

export function priorityFromBackend(priority?: StudyMetadataInput["reviewPriority"]): Priority {
  if (priority === "high") return "alta";
  if (priority === "low") return "baja";
  return "media";
}

export function validateSubjectRef(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length < 3 || trimmed.length > 64) return subjectRefErrorMessage;
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) return subjectRefErrorMessage;
  return null;
}

export function normalizeStudyMetadataInput(draft: StudyMetadataDraft): StudyMetadataInput {
  const subjectRef = draft.subjectRef.trim();
  const description = draft.description.trim();
  return {
    subjectRef: subjectRef || null,
    studyDate: draft.studyDate || null,
    modality: draft.modality || null,
    description: description || null,
    reviewPriority: draft.reviewPriority,
  };
}

export function emptyStudyMetadataDraft(priority: StudyMetadataInput["reviewPriority"] = "medium"): StudyMetadataDraft {
  return {
    subjectRef: "",
    studyDate: "",
    modality: "",
    description: "",
    reviewPriority: priority,
  };
}
