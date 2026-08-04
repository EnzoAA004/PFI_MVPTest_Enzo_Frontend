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

/**
 * Serie DICOM encontrada dentro de un estudio, tal como la clasificó el AI Module.
 *
 * El plano sale de `ImageOrientationPatient` y la ponderación de la descripción o
 * del tiempo de eco: son los datos del propio archivo, no una elección del médico.
 */
export type StudySeriesSummary = {
  seriesInstanceUid: string;
  description: string;
  plane: "sagittal" | "axial" | "coronal" | string;
  weighting: "t1" | "t2" | string;
  sliceCount: number;
};

/**
 * DTO HTTP de POST /api/ai/studies: un estudio completo en un solo archivo.
 *
 * El módulo abre el zip, clasifica cada serie y elige una por plano. Devuelve todas
 * las series que encontró y no solo las elegidas, porque el médico necesita ver qué
 * había en el estudio para entender por qué se eligió lo que se eligió — y sobre todo
 * para notar cuando lo que falta es una serie que esperaba.
 *
 * `warnings` es donde el módulo dice lo que no pudo cumplir: que no hay sagital, que
 * el axial no es T2 y el modelo axial fue entrenado sobre T2. Son advertencias que
 * tienen que llegar a la pantalla, no descartarse.
 */
export type StudyIngestionResponse = {
  caseId: string;
  studyId: string;
  seriesFound: StudySeriesSummary[];
  warnings: string[];
  sagittal?: InputResponse & StudySeriesSummary;
  axial?: InputResponse & StudySeriesSummary;
};
