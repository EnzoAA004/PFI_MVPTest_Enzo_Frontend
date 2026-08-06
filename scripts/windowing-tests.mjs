import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Ventana sobre las intensidades originales.
 *
 * Lo que se protege acá es que el preset se derive del corte que se está mirando. Una
 * ventana con números fijos se ve perfectamente bien en el estudio con el que se la
 * eligió y deja negro al siguiente, y el médico no tiene cómo notar la diferencia
 * salvo por la imagen mala.
 */
const source = fs.readFileSync("src/features/reading/pixels.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, console, TextDecoder, Uint32Array, Int16Array, Uint8ClampedArray, ImageData: class {} };
vm.runInNewContext(`${js}
exports.percentileWindow = percentileWindow;
exports.defaultWindow = defaultWindow;`, sandbox);
const { percentileWindow, defaultWindow } = sandbox.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

const metaOf = (pixels) => ({
  count: pixels.length, width: pixels.length, height: 1, dtype: "int16", byteOrder: "little",
  min: Math.min(...pixels), max: Math.max(...pixels),
});

/** Rampa 0..999: el percentil p cae en el valor p*1000. */
const rampa = Int16Array.from({ length: 1000 }, (_, index) => index);

check("el rango completo es la ventana por defecto", () => {
  const ventana = percentileWindow(rampa, metaOf(rampa), 0, 1);
  assert.deepEqual(ventana, defaultWindow(metaOf(rampa)));
});

check("recortar las colas angosta la ventana y la deja centrada", () => {
  const ventana = percentileWindow(rampa, metaOf(rampa), 0.1, 0.9);
  assert.ok(Math.abs(ventana.center - 499.5) < 5, `centro inesperado: ${ventana.center}`);
  assert.ok(Math.abs(ventana.width - 800) < 10, `ancho inesperado: ${ventana.width}`);
});

check("cuanto más se recorta, más angosta la ventana", () => {
  const meta = metaOf(rampa);
  const suave = percentileWindow(rampa, meta, 0.02, 0.98);
  const fuerte = percentileWindow(rampa, meta, 0.1, 0.9);
  assert.ok(fuerte.width < suave.width, "el preset de alto contraste tiene que abrir menos");
});

check("una cola larga y brillante no se lleva toda la ventana", () => {
  /*
   * Es el caso que motiva el preset: unos pocos píxeles muy brillantes —grasa, un
   * artefacto— estiran el máximo y dejan toda la anatomía apretada en la parte baja
   * del rango. El percentil los deja afuera.
   */
  const conCola = Int16Array.from([...Array(990).fill(0).map((_, i) => i % 100), ...Array(10).fill(30000)]);
  const meta = metaOf(conCola);
  assert.equal(meta.max, 30000);
  const ventana = percentileWindow(conCola, meta, 0.02, 0.98);
  assert.ok(ventana.width < 5000, `la cola siguió mandando: ancho ${ventana.width}`);
});

check("un corte uniforme no produce una ventana de ancho cero", () => {
  // Sin ancho la imagen queda en blanco y negro puros: es peor que no aplicar nada.
  const plano = Int16Array.from(Array(100).fill(7));
  const ventana = percentileWindow(plano, metaOf(plano), 0.1, 0.9);
  assert.ok(ventana.width >= 1, "el ancho tiene que quedar utilizable");
});

check("un corte vacío se cae a la ventana por defecto", () => {
  const vacio = new Int16Array(0);
  const meta = { count: 0, width: 1, height: 1, dtype: "int16", byteOrder: "little", min: 0, max: 100 };
  assert.deepEqual(percentileWindow(vacio, meta, 0.1, 0.9), defaultWindow(meta));
});

check("la ventana no depende del tamaño del corte, solo de su distribución", () => {
  // Un preset que cambiara con la cantidad de píxeles no sería comparable entre cortes.
  const grande = Int16Array.from({ length: 4000 }, (_, index) => index % 1000);
  const a = percentileWindow(rampa, metaOf(rampa), 0.1, 0.9);
  const b = percentileWindow(grande, metaOf(grande), 0.1, 0.9);
  assert.ok(Math.abs(a.width - b.width) < 10, `${a.width} vs ${b.width}`);
});

console.log(`windowing: ${passed} passed`);
