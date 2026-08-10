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
  /**
   * Identificador de la serie guardada, para poder mostrarla después.
   *
   * Ahora se conservan las siete series del estudio y no solo las dos que analiza la
   * IA: la T1 es la que muestra la grasa y la médula ósea, y el médico la lee aunque
   * ningún modelo la toque.
   */
  inputId: string;
  description: string;
  plane: "sagittal" | "axial" | "coronal" | string;
  weighting: "t1" | "t2" | string;
  sliceCount: number;
  /** Serie cuyos cortes no comparten plano: un localizer. No es un volumen. */
  multiplanar: boolean;
  /** Captura de consola o reformateo, no imagen adquirida. */
  derived: boolean;
  /** Si pudo ser entrada de una corrida. Ver `StudySeries` en appTypes. */
  analyzable: boolean;
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
/**
 * Plano elegido del estudio, con la posición de su serie dentro de `seriesFound`.
 *
 * Es una posición y no el identificador DICOM de la serie: ese UID lleva de vuelta al
 * estudio original en el PACS de origen, así que no sale de un pipeline
 * de-identificado. La posición alcanza para marcar cuál de las series listadas
 * produjo los resultados, que es lo único que la pantalla necesita.
 */
export type StudyPlaneInput = InputResponse & Omit<StudySeriesSummary, "plane"> & {
  seriesIndex?: number;
};

export type StudyIngestionResponse = {
  caseId: string;
  studyId: string;
  seriesFound: StudySeriesSummary[];
  warnings: string[];
  sagittal?: StudyPlaneInput;
  axial?: StudyPlaneInput;
  /** Series independientes por ponderación para el flujo P10.7. */
  sagittalT1?: StudyPlaneInput;
  sagittalT2?: StudyPlaneInput;
  humanReviewRequired: boolean;
  notClinicalDiagnosis: boolean;
};
