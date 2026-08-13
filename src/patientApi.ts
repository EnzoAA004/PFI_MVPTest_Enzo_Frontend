import { ContractError } from "./api";
import { multiplanarRequest } from "./multiplanarApi";

export type PatientSummary = {
  id: string;
  patientReference: string;
  createdAt: string;
  updatedAt: string;
};

export type PatientDetail = PatientSummary;

export type CreatePatientRequest = {
  patientReference: string;
};

export type StudyPatientAssignmentRequest = {
  patientId: string;
  expectedPatientId: string | null;
  reason: "INITIAL_ASSIGNMENT";
};

export type StudyPatientAssignmentResponse = {
  studyId: string;
  caseId: string;
  patientId: string;
  previousPatientId: string | null;
  reasonCode: "INITIAL_ASSIGNMENT";
  changed: boolean;
};

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractError(`Contrato inválido en ${path}.`, path);
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ContractError(`Contrato incompleto en ${path}: falta ${key}.`, path);
  }
  return value;
}

export function parsePatient(value: unknown, path = "/api/patients"): PatientDetail {
  const record = asRecord(value, path);
  return {
    id: requiredString(record, "id", path),
    patientReference: requiredString(record, "patientReference", path),
    createdAt: requiredString(record, "createdAt", path),
    updatedAt: requiredString(record, "updatedAt", path),
  };
}

export function parsePatientSearch(value: unknown): PatientSummary[] {
  const path = "/api/patients";
  if (!Array.isArray(value)) throw new ContractError(`Contrato inválido en ${path}.`, path);
  return value.map((patient) => parsePatient(patient, path));
}

export function parseStudyPatientAssignment(
  value: unknown,
  expected: { caseId: string; patientId: string },
): StudyPatientAssignmentResponse {
  const path = `/api/studies/${expected.caseId}/patient`;
  const record = asRecord(value, path);
  const caseId = requiredString(record, "caseId", path);
  const patientId = requiredString(record, "patientId", path);
  if (caseId !== expected.caseId || patientId !== expected.patientId) {
    throw new ContractError("La asociación devuelta no corresponde al Study y Patient solicitados.", path);
  }
  if (record.reasonCode !== "INITIAL_ASSIGNMENT" || typeof record.changed !== "boolean") {
    throw new ContractError("La asociación no confirmó reasonCode y estado idempotente.", path);
  }
  const previousPatientId = record.previousPatientId;
  if (previousPatientId !== null && typeof previousPatientId !== "string") {
    throw new ContractError("previousPatientId inválido en la asociación.", path);
  }
  return {
    studyId: requiredString(record, "studyId", path),
    caseId,
    patientId,
    previousPatientId,
    reasonCode: "INITIAL_ASSIGNMENT",
    changed: record.changed,
  };
}

export async function createPatient(request: CreatePatientRequest): Promise<PatientDetail> {
  const value = await multiplanarRequest<unknown>("/api/patients", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return parsePatient(value);
}

export async function searchPatients(query: string, limit = 25): Promise<PatientSummary[]> {
  const params = new URLSearchParams({ query: query.trim(), limit: String(limit) });
  const value = await multiplanarRequest<unknown>(`/api/patients?${params.toString()}`);
  return parsePatientSearch(value);
}

export async function getPatient(patientId: string): Promise<PatientDetail> {
  const path = `/api/patients/${encodeURIComponent(patientId)}`;
  const value = await multiplanarRequest<unknown>(path);
  return parsePatient(value, path);
}

export async function associateStudyPatient(
  caseId: string,
  request: StudyPatientAssignmentRequest,
): Promise<StudyPatientAssignmentResponse> {
  const path = `/api/studies/${encodeURIComponent(caseId)}/patient`;
  const value = await multiplanarRequest<unknown>(path, {
    method: "PUT",
    body: JSON.stringify(request),
  });
  return parseStudyPatientAssignment(value, { caseId, patientId: request.patientId });
}
