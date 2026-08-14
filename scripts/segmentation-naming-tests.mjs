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
vm.runInNewContext(`${js}\nexports.instanceLabel = instanceLabel; exports.instanceColor = instanceColor; exports.resolveSegmentationDisplayColor = resolveSegmentationDisplayColor;`, sandbox);
const { instanceLabel, instanceColor, resolveSegmentationDisplayColor } = sandbox.exports;

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

const vertebral = (level, label, index) => instance({ index, id: `${level}-${label}`, label, classKey: "vertebra_group", level });
const levels = ["L1", "L2", "L3", "L4", "L5"];
const bodies = levels.map((level, offset) => vertebral(level, "vertebra", offset + 8));
const posterior = levels.map((level, offset) => vertebral(level, "posterior_element", offset + 16));
const lumbarDiscs = [
  instance({ index: 3, id: "disc-l1-l2", label: "disc", classKey: "disc_group", level: "L1-L2" }),
  instance({ index: 4, id: "disc-l2-l3", label: "disc", classKey: "disc_group", level: "L2-L3" }),
];
const levelSegmentation = {
  encoding: "rle-v1",
  width: 1,
  height: 1,
  data: [0, 1],
  instances: [...lumbarDiscs, ...bodies, ...posterior],
};
const levelColors = new Set();
for (const [offset, level] of levels.entries()) {
  const bodyInstance = bodies[offset];
  const posteriorInstance = posterior[offset];
  const bodyBefore = structuredClone(bodyInstance);
  const posteriorBefore = structuredClone(posteriorInstance);
  const bodyColor = resolveSegmentationDisplayColor(bodyInstance, levelSegmentation);
  const posteriorColor = resolveSegmentationDisplayColor(posteriorInstance, levelSegmentation);
  assert.equal(bodyColor, posteriorColor, `cuerpo y arco ${level} comparten color de display`);
  assert.deepEqual(bodyInstance, bodyBefore, `resolver color no muta cuerpo ${level}`);
  assert.deepEqual(posteriorInstance, posteriorBefore, `resolver color no muta arco ${level}`);
  levelColors.add(bodyColor);
  passed += 1;
}
assert.equal(levelColors.size, levels.length, "L1-L5 mantienen identidades cromáticas distintas");
passed += 1;

const discL1L2Color = resolveSegmentationDisplayColor(lumbarDiscs[0], levelSegmentation);
assert.notEqual(discL1L2Color, resolveSegmentationDisplayColor(posterior[0], levelSegmentation), "L1-L2 no da color al arco L1");
assert.notEqual(discL1L2Color, resolveSegmentationDisplayColor(posterior[1], levelSegmentation), "L1-L2 no da color al arco L2");
const discL2L3Color = resolveSegmentationDisplayColor(lumbarDiscs[1], levelSegmentation);
assert.notEqual(discL2L3Color, resolveSegmentationDisplayColor(posterior[1], levelSegmentation), "L2-L3 no da color al arco L2");
assert.notEqual(discL2L3Color, resolveSegmentationDisplayColor(posterior[2], levelSegmentation), "L2-L3 no da color al arco L3");
passed += 1;

const bodyWithoutMutation = vertebral("L1", "vertebra", 8);
const posteriorWithoutLevel = vertebral(null, "posterior_element", 13);
const discInSameMask = instance({ index: 3, id: "disc-neighbor", label: "disc", classKey: "disc_group", level: "L1-L2" });
const overlapSegmentation = {
  encoding: "rle-v1",
  width: 4,
  height: 3,
  data: [8, 2, 13, 2, 8, 2, 13, 2, 3, 4],
  instances: [discInSameMask, bodyWithoutMutation, posteriorWithoutLevel],
};
assert.equal(
  resolveSegmentationDisplayColor(posteriorWithoutLevel, overlapSegmentation),
  resolveSegmentationDisplayColor(bodyWithoutMutation, overlapSegmentation),
  "un arco sin nivel sólo hereda de un cuerpo con solapamiento vertical",
);
assert.notEqual(
  resolveSegmentationDisplayColor(posteriorWithoutLevel, overlapSegmentation),
  resolveSegmentationDisplayColor(discInSameMask, overlapSegmentation),
  "un disco presente en la misma máscara nunca es candidato de color",
);
passed += 1;

const canal = instance({ index: 12, id: "canal", label: "canal", classKey: "canal", level: null });
assert.equal(
  resolveSegmentationDisplayColor(canal),
  instanceColor(canal.index),
  "una estructura no vertebral conserva el mapping por índice",
);
passed += 1;

console.log(`segmentation-naming: ${passed} passed`);
