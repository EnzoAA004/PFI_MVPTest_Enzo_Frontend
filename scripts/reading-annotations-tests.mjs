import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Anotaciones con alcance study/level/slice: lo que se verifica es que una
 * anotación nunca se dibuje sobre un corte que no le corresponde, y que una
 * medición solo se exprese en milímetros cuando la corrida informó la escala.
 */
const source = fs.readFileSync("src/features/reading/annotations.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const sandbox = { exports: {}, console };
vm.runInNewContext(`${js}
exports.isAnnotationVisible = isAnnotationVisible;
exports.annotatedSlices = annotatedSlices;
exports.measureDistance = measureDistance;
exports.formatMeasurement = formatMeasurement;
exports.displayAnnotationScope = displayAnnotationScope;
exports.landmarkToAnnotation = landmarkToAnnotation;
exports.annotationToLandmark = annotationToLandmark;
exports.withLandmarkAnnotations = withLandmarkAnnotations;`, sandbox);

const { isAnnotationVisible, annotatedSlices, measureDistance, formatMeasurement, displayAnnotationScope,
  landmarkToAnnotation, annotationToLandmark, withLandmarkAnnotations } = sandbox.exports;

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

const base = { id: "a1", kind: "note", author: "Revisor", createdAt: "2026-07-30T00:00:00Z" };
const context = { plane: "sagittal", seriesId: "s1", sliceIndex: 7, level: "L4-L5" };

test("A anotacion de corte se ve solo en su corte", () => {
  const annotation = { ...base, scope: "slice", plane: "sagittal", seriesId: "s1", sliceIndex: 7 };
  assert.equal(isAnnotationVisible(annotation, context), true);
  assert.equal(isAnnotationVisible(annotation, { ...context, sliceIndex: 8 }), false);
});

test("B anotacion de corte no cruza de plano", () => {
  const annotation = { ...base, scope: "slice", plane: "axial", seriesId: "s1", sliceIndex: 7 };
  assert.equal(isAnnotationVisible(annotation, context), false);
});

test("C anotacion de corte no cruza de serie", () => {
  const annotation = { ...base, scope: "slice", plane: "sagittal", seriesId: "s2", sliceIndex: 7 };
  assert.equal(isAnnotationVisible(annotation, context), false);
});

test("D anotacion de nivel se ve en cualquier corte de ese nivel", () => {
  const annotation = { ...base, scope: "level", level: "L4-L5" };
  assert.equal(isAnnotationVisible(annotation, context), true);
  assert.equal(isAnnotationVisible(annotation, { ...context, sliceIndex: 2 }), true);
  assert.equal(isAnnotationVisible(annotation, { ...context, level: "L5-S1" }), false);
});

test("E anotacion de nivel sin nivel no se dibuja", () => {
  assert.equal(isAnnotationVisible({ ...base, scope: "level" }, { ...context, level: null }), false);
});

test("F anotacion de estudio nunca se dibuja sobre la imagen", () => {
  assert.equal(isAnnotationVisible({ ...base, scope: "study" }, context), false);
});

test("G annotatedSlices reporta solo los cortes del plano pedido", () => {
  const annotations = [
    { ...base, id: "1", scope: "slice", plane: "sagittal", sliceIndex: 3 },
    { ...base, id: "2", scope: "slice", plane: "sagittal", sliceIndex: 9 },
    { ...base, id: "3", scope: "slice", plane: "axial", sliceIndex: 4 },
    { ...base, id: "4", scope: "study" },
    { ...base, id: "5", scope: "level", level: "L4-L5" },
  ];
  assert.deepEqual([...annotatedSlices(annotations, "sagittal")].sort(), [3, 9]);
  assert.deepEqual([...annotatedSlices(annotations, "axial")], [4]);
});

test("H sin spacing la medicion se reporta en px, nunca en mm", () => {
  const result = measureDistance({ x: 0, y: 0 }, { x: 128, y: 0 }, { width: 256, height: 256 }, undefined);
  assert.equal(result.unit, "px");
  assert.equal(Math.round(result.value), 128);
});

test("I con spacing la medicion es fisica y usa el eje que corresponde", () => {
  // Píxel de 2 mm de alto por 0.5 mm de ancho: un trazo horizontal de 128 px de
  // la base 0..256 sobre un marco de 256 mide 128 * 0.5 = 64 mm.
  const horizontal = measureDistance({ x: 0, y: 0 }, { x: 128, y: 0 }, { width: 256, height: 256 }, [2, 0.5]);
  assert.equal(horizontal.unit, "mm");
  assert.equal(Math.round(horizontal.value), 64);
  // El mismo trazo en vertical usa el spacing de fila: 128 * 2 = 256 mm.
  const vertical = measureDistance({ x: 0, y: 0 }, { x: 0, y: 128 }, { width: 256, height: 256 }, [2, 0.5]);
  assert.equal(Math.round(vertical.value), 256);
});

test("J spacing invalido no se toma como escala fisica", () => {
  assert.equal(measureDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { width: 256, height: 256 }, [0, 1]).unit, "px");
  assert.equal(measureDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { width: 256, height: 256 }, [1]).unit, "px");
});

test("K el marco real, y no la base normalizada, define la distancia", () => {
  // Mismo trazo en la base 0..256 sobre marcos de distinto ancho: la distancia
  // fisica tiene que seguir al marco, no a la base.
  const narrow = measureDistance({ x: 0, y: 0 }, { x: 256, y: 0 }, { width: 128, height: 128 }, [1, 1]);
  const wide = measureDistance({ x: 0, y: 0 }, { x: 256, y: 0 }, { width: 512, height: 512 }, [1, 1]);
  assert.equal(Math.round(narrow.value), 128);
  assert.equal(Math.round(wide.value), 512);
});

test("L el formato distingue mm de px", () => {
  assert.equal(formatMeasurement(12.34, "mm"), "12.3 mm");
  assert.equal(formatMeasurement(12.34, "px"), "12 px");
});

test("M el alcance se rotula con su contexto", () => {
  assert.equal(displayAnnotationScope({ ...base, scope: "study" }), "Todo el estudio");
  assert.equal(displayAnnotationScope({ ...base, scope: "level", level: "L3-L4" }), "L3-L4");
  assert.equal(displayAnnotationScope({ ...base, scope: "slice", sliceIndex: 6 }), "Corte 7");
});

/*
 * Landmarks persistidos como marcas.
 *
 * Se editaban y se perdían al recargar. Lo que se protege es la ida y vuelta: lo que
 * se guarda tiene que volver en el mismo corte y en la misma posición, porque un
 * landmark que reaparece corrido señala otra estructura.
 */
const landmark = { id: "lm-1", label: "Borde posterior L4", seriesId: "s-sag", sliceIndex: 7, x: 120.5, y: 88.25 };

test("un landmark ida y vuelta conserva corte y posición", () => {
  const marca = landmarkToAnnotation(landmark, "sagittal", "revisor");
  assert.equal(marca.kind, "marker");
  assert.equal(marca.scope, "slice");
  assert.equal(marca.plane, "sagittal");
  const vuelto = annotationToLandmark(marca);
  assert.equal(vuelto.id, landmark.id);
  assert.equal(vuelto.label, landmark.label);
  assert.equal(vuelto.sliceIndex, 7);
  assert.equal(vuelto.x, 120.5);
  assert.equal(vuelto.y, 88.25);
});

test("una anotación que no es marca no se lee como landmark", () => {
  assert.equal(annotationToLandmark({ id: "a", kind: "measurement", scope: "slice", points: [{ x: 1, y: 2 }] }), null);
});

test("una marca sin corte o sin punto no inventa una posición", () => {
  // Devolver (0,0) pondría una marca en la esquina de la imagen, que se lee como que
  // el revisor señaló algo ahí.
  assert.equal(annotationToLandmark({ id: "a", kind: "marker", scope: "slice", seriesId: "s", points: [] }), null);
  assert.equal(annotationToLandmark({ id: "a", kind: "marker", scope: "slice", points: [{ x: 1, y: 2 }] }), null);
});

test("mover un landmark varias veces deja una sola marca", () => {
  const primera = landmarkToAnnotation(landmark, "sagittal", "revisor");
  const segunda = landmarkToAnnotation({ ...landmark, x: 200 }, "sagittal", "revisor");
  const lista = withLandmarkAnnotations([primera], [segunda]);
  assert.equal(lista.length, 1, "el mismo identificador no puede acumular copias");
  assert.equal(lista[0].points[0].x, 200, "queda la última posición");
});

test("guardar landmarks no borra las demás anotaciones", () => {
  const medicion = { id: "med-1", kind: "measurement", scope: "slice", points: [{ x: 0, y: 0 }] };
  const lista = withLandmarkAnnotations([medicion], [landmarkToAnnotation(landmark, "sagittal", "revisor")]);
  assert.equal(lista.length, 2);
  assert.ok(lista.some((item) => item.id === "med-1"));
});

console.log(`Reading annotations tests passed: ${count}`);
