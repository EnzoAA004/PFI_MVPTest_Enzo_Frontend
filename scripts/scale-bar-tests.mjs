import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * La barra de escala del visor.
 *
 * Lo que se protege acá es la elección del escalón. El bug que motivó estos tests no era
 * un número mal calculado: eran dos viewports con escalas casi iguales —0,729 y 0,688
 * mm/px— mostrando 50 mm y 20 mm uno al lado del otro. Los dos correctos, y aun así la
 * pantalla se leía como si las imágenes estuvieran a escalas muy distintas.
 */
const source = fs.readFileSync("src/features/reading/scaleBar.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, console };
vm.runInNewContext(`${js}\nexports.scaleBarFor = scaleBarFor;`, sandbox);
const { scaleBarFor } = sandbox.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

const bar = (overrides = {}) => scaleBarFor({
  pixelSpacingMm: [0.729, 0.729], imageWidth: 384, sourceWidth: 384, zoom: 1.5, ...overrides,
});

// --- el bug que motivó el módulo ---------------------------------------------------

check("dos series con espaciado casi igual muestran el mismo escalón", () => {
  const sagital = bar({ pixelSpacingMm: [0.729, 0.729] });
  const axial = bar({ pixelSpacingMm: [0.688, 0.688] });
  assert.equal(sagital.mm, axial.mm);
});

check("se elige el escalón más grande que entra, no el primero", () => {
  const result = bar();
  // Con estos números entran 20 y 50; tiene que ganar 50, que es la barra más larga
  // y la más precisa de leer.
  const pxPerMm = 1.5 / 0.729;
  assert.ok(20 * pxPerMm >= 40, "20 mm también entraba");
  assert.equal(result.mm, 50);
});

// --- que el largo sea legible ------------------------------------------------------

check("la barra siempre queda en un largo usable", () => {
  for (const zoom of [0.5, 0.8, 1, 1.5, 2, 3, 5]) {
    for (const spacing of [0.3, 0.5, 0.688, 0.729, 1.0]) {
      const result = bar({ zoom, pixelSpacingMm: [spacing, spacing] });
      if (!result) continue;
      assert.ok(result.px >= 40 && result.px <= 200, `zoom ${zoom}, spacing ${spacing}: ${result.px}px`);
    }
  }
});

check("los milímetros son escalones redondos", () => {
  const redondos = new Set([1, 2, 5, 10, 20, 50, 100, 200]);
  for (const zoom of [0.5, 1, 2, 4]) {
    const result = bar({ zoom });
    if (result) assert.ok(redondos.has(result.mm), `${result.mm} no es un escalón redondo`);
  }
});

check("al acercar, la barra representa menos milímetros", () => {
  const lejos = bar({ zoom: 1 });
  const cerca = bar({ zoom: 4 });
  assert.ok(cerca.mm < lejos.mm);
});

check("el largo en píxeles corresponde a los milímetros que declara", () => {
  const zoom = 2;
  const spacing = 0.5;
  const result = bar({ zoom, pixelSpacingMm: [spacing, spacing] });
  // px = mm / (mm por píxel de imagen) * zoom
  assert.equal(Math.round(result.px), Math.round(result.mm / spacing * zoom));
});

// --- cuando el PNG no tiene la resolución de la serie --------------------------------

check("se corrige si la imagen mostrada tiene otra resolución que la serie", () => {
  // Un PNG de 256 sobre una serie de 512: cada píxel del PNG cubre dos de la serie.
  const igual = bar({ imageWidth: 512, sourceWidth: 512, zoom: 1 });
  const reducido = bar({ imageWidth: 256, sourceWidth: 512, zoom: 1 });
  // La misma distancia real ocupa la mitad de píxeles de pantalla.
  assert.ok(reducido.px < igual.px || reducido.mm !== igual.mm);
});

check("usa el espaciado entre columnas, que es el horizontal", () => {
  // DICOM PixelSpacing es [entre filas, entre columnas]. Una barra horizontal mide con
  // el segundo; usar el primero da un largo equivocado en series no isotrópicas.
  const result = scaleBarFor({ pixelSpacingMm: [2.0, 0.5], imageWidth: 384, sourceWidth: 384, zoom: 1 });
  assert.equal(Math.round(result.px), Math.round(result.mm / 0.5));
});

// --- lo que NO se debe dibujar -------------------------------------------------------

check("sin espaciado físico no se dibuja ninguna barra", () => {
  assert.equal(bar({ pixelSpacingMm: null }), null);
  assert.equal(bar({ pixelSpacingMm: undefined }), null);
});

check("un espaciado invalido no produce barra", () => {
  assert.equal(bar({ pixelSpacingMm: [0, 0] }), null);
  assert.equal(bar({ pixelSpacingMm: [NaN, NaN] }), null);
  assert.equal(bar({ pixelSpacingMm: [-1, -1] }), null);
});

check("sin imagen medida no se dibuja", () => {
  assert.equal(bar({ imageWidth: 0 }), null);
  assert.equal(bar({ imageWidth: NaN }), null);
});

check("un zoom invalido no produce barra", () => {
  assert.equal(bar({ zoom: 0 }), null);
  assert.equal(bar({ zoom: -2 }), null);
  assert.equal(bar({ zoom: Infinity }), null);
});

check("con un zoom extremo se prefiere no dibujar antes que mentir", () => {
  // Tan alejado que ni 200 mm llegan a 40 px: mejor nada que una barra de 3 px.
  assert.equal(bar({ zoom: 0.001 }), null);
});

console.log(`scale-bar: ${passed} passed`);
