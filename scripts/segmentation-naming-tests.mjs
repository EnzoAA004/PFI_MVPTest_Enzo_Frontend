import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Nombres de las instancias de segmentación.
 *
 * Lo que se protege acá es que la leyenda nunca vuelva a mostrar varias filas con
 * el mismo texto: el modelo devuelve cuerpos vertebrales y arcos posteriores bajo
 * la misma clase `vertebra_group`, y mostrarlos por clase hacía que nueve renglones
 * dijeran "Grupo vertebral" sin manera de saber cuál era cuál.
 *
 * Igual de importante es lo contrario: cuando no se pudo asignar nivel, el nombre
 * tiene que quedarse en la estructura y no inventar una vértebra.
 */
const source = fs.readFileSync("src/features/reading/segmentation.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const sandbox = { exports: {}, console };
vm.runInNewContext(`${js}\nexports.instanceLabel = instanceLabel;`, sandbox);
const { instanceLabel } = sandbox.exports;

// Traductor mínimo, con las mismas entradas que usa la pantalla.
const translate = (value) => ({
  vertebra: "Cuerpo vertebral",
  posterior_element: "Arco posterior",
  vertebra_group: "Grupo vertebral",
  disc: "Disco",
  canal: "Canal espinal",
}[value] ?? String(value));

const instance = (over) => ({ index: 1, id: "x", label: "", classKey: "", ...over });

const cases = [
  [
    "un cuerpo con nivel se nombra solo por el nivel, como se dicta",
    instance({ label: "vertebra", classKey: "vertebra_group", level: "L4" }),
    "L4",
  ],
  [
    "un cuerpo sin nivel cae en la estructura, no en la clase del modelo",
    instance({ label: "vertebra", classKey: "vertebra_group", level: null }),
    "Cuerpo vertebral",
  ],
  [
    "un arco posterior lleva estructura y nivel, porque 'L4' ya lo usa el cuerpo",
    instance({ label: "posterior_element", classKey: "vertebra_group", level: "L4" }),
    "Arco posterior L4",
  ],
  [
    "un arco sin nivel no inventa vertebra",
    instance({ label: "posterior_element", classKey: "vertebra_group", level: null }),
    "Arco posterior",
  ],
  [
    "un disco con nivel muestra estructura y nivel",
    instance({ label: "disc", classKey: "disc_group", level: "L4-L5" }),
    "Disco L4-L5",
  ],
  [
    "sin estructura se usa la clase, que es lo unico que hay",
    instance({ label: "", classKey: "canal" }),
    "Canal espinal",
  ],
];

let passed = 0;
for (const [name, value, expected] of cases) {
  assert.equal(instanceLabel(value, translate), expected, name);
  passed += 1;
}

// Un cuerpo y su arco no pueden compartir texto: es exactamente lo que se rompio.
const body = instanceLabel(instance({ label: "vertebra", classKey: "vertebra_group", level: "L3" }), translate);
const arch = instanceLabel(instance({ label: "posterior_element", classKey: "vertebra_group", level: "L3" }), translate);
assert.notEqual(body, arch, "cuerpo y arco de la misma vertebra deben distinguirse");
passed += 1;

console.log(`segmentation-naming: ${passed} passed`);
