import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Calculadores de las herramientas de medición.
 *
 * La regla que sostiene el módulo entero, y la que más se protege acá: el valor sale
 * siempre de la geometría. Si el número y la figura se calcularan por caminos
 * distintos podrían discrepar, y el médico vería una cota sobre la imagen que dice
 * algo distinto de lo que muestra la tabla.
 *
 * El otro grupo de pruebas fija los casos en que NO hay que informar: sin escala
 * física no se inventan milímetros, y una figura incompleta no produce un número.
 */
const source = fs.readFileSync("src/features/reading/measurements.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const sandbox = { exports: {}, console };
vm.runInNewContext(
  `${js}
exports.distanceBetween = distanceBetween;
exports.angleBetween = angleBetween;
exports.listhesisFrom = listhesisFrom;
exports.meyerdingGrade = meyerdingGrade;
exports.polygonArea = polygonArea;
exports.pointInPolygon = pointInPolygon;
exports.intensityStats = intensityStats;
exports.probeIntensity = probeIntensity;
exports.recomputeValue = recomputeValue;
exports.formatMeasurementValue = formatMeasurementValue;
exports.physicalSpacing = physicalSpacing;`,
  sandbox,
);
const {
  distanceBetween, angleBetween, listhesisFrom, meyerdingGrade, polygonArea, pointInPolygon,
  intensityStats, probeIntensity, recomputeValue, formatMeasurementValue, physicalSpacing,
} = sandbox.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

// La base 0..256 mapeada a un marco de 256x256 con píxeles de 1 mm: un punto de la
// base es un milímetro, que hace las cuentas legibles sin perder generalidad.
const frame = { width: 256, height: 256 };
const unitSpacing = [1, 1];
const point = (x, y) => ({ x, y });

// --- Distancia ------------------------------------------------------------

check("una distancia horizontal mide lo que separa sus extremos", () => {
  const result = distanceBetween(point(10, 50), point(50, 50), frame, unitSpacing);
  assert.equal(result.value, 40);
  assert.equal(result.unit, "mm");
});

check("sin escala física no se inventan milímetros", () => {
  const result = distanceBetween(point(10, 50), point(50, 50), frame, null);
  assert.equal(result.unit, "px");
});

check("el spacing anisotrópico se aplica por eje y no promediado", () => {
  // 30 de ancho por 40 de alto, con píxeles el doble de altos: 30 y 80 mm, o sea 3-4-5.
  const result = distanceBetween(point(0, 0), point(30, 40), frame, [2, 1]);
  assert.equal(Math.round(result.value), Math.round(Math.hypot(30, 80)));
});

// --- Ángulo ---------------------------------------------------------------

check("dos rectas perpendiculares dan noventa grados", () => {
  const result = angleBetween([point(0, 0), point(10, 0), point(0, 0), point(0, 10)], frame, unitSpacing);
  assert.equal(Math.round(result.value), 90);
  assert.equal(result.unit, "deg");
});

check("dos rectas paralelas dan cero", () => {
  const result = angleBetween([point(0, 0), point(10, 0), point(0, 30), point(10, 30)], frame, unitSpacing);
  assert.equal(Math.round(result.value), 0);
});

check("el ángulo no depende de hacia dónde se arrastró", () => {
  // Una recta no tiene sentido: invertir los extremos no puede cambiar la lordosis.
  const directo = angleBetween([point(0, 0), point(10, 0), point(0, 0), point(10, 10)], frame, unitSpacing);
  const invertido = angleBetween([point(10, 0), point(0, 0), point(10, 10), point(0, 0)], frame, unitSpacing);
  assert.equal(Math.round(directo.value), Math.round(invertido.value));
  assert.equal(Math.round(directo.value), 45);
});

check("el ángulo se calcula en milímetros, no sobre la grilla de píxeles", () => {
  /*
   * Con píxeles el doble de altos, una recta a 45 grados en la grilla está a 63 en la
   * anatomía. Calcular sobre píxeles daría 45 y sería un ángulo que el paciente no
   * tiene: es el mismo error que deformaba las medidas antes de medir en milímetros.
   */
  const result = angleBetween([point(0, 0), point(10, 0), point(0, 0), point(10, 10)], frame, [2, 1]);
  assert.equal(Math.round(result.value), Math.round(Math.atan2(20, 10) * 180 / Math.PI));
});

check("un ángulo con menos de cuatro puntos no devuelve un número", () => {
  assert.equal(angleBetween([point(0, 0), point(10, 0)], frame, unitSpacing), null);
});

// --- Listesis -------------------------------------------------------------

check("la listesis mide el corrimiento sobre el platillo, no la separación", () => {
  // Platillo de 40 mm de largo; la vértebra de arriba corrida 10 mm hacia atrás.
  const result = listhesisFrom([point(10, 50), point(50, 50), point(60, 30)], frame, unitSpacing);
  assert.equal(Math.round(result.value), 10);
  assert.equal(result.unit, "mm");
});

check("el grado de Meyerding sale de la proporción, no del milimetraje", () => {
  // 10 sobre 40 es 25%: grado I. El mismo corrimiento sobre una vértebra más chica sube de grado.
  assert.equal(listhesisFrom([point(10, 50), point(50, 50), point(60, 30)], frame, unitSpacing).detail, "grado I");
  assert.equal(listhesisFrom([point(30, 50), point(50, 50), point(65, 30)], frame, unitSpacing).detail, "grado III");
});

check("los cortes entre grados de Meyerding caen del lado que corresponde", () => {
  assert.equal(meyerdingGrade(0.25), "I");
  assert.equal(meyerdingGrade(0.2501), "II");
  assert.equal(meyerdingGrade(0.5), "II");
  assert.equal(meyerdingGrade(0.75), "III");
  assert.equal(meyerdingGrade(1), "IV");
  assert.equal(meyerdingGrade(1.2), "V");
});

check("una vértebra sin platillo medible no produce una listesis", () => {
  assert.equal(listhesisFrom([point(10, 50), point(10, 50), point(60, 30)], frame, unitSpacing), null);
  assert.equal(listhesisFrom([point(10, 50), point(50, 50)], frame, unitSpacing), null);
});

// --- ROI ------------------------------------------------------------------

check("el área de un cuadrado es su lado al cuadrado", () => {
  const result = polygonArea([point(0, 0), point(20, 0), point(20, 20), point(0, 20)], frame, unitSpacing);
  assert.equal(result.value, 400);
  assert.equal(result.unit, "mm2");
});

check("el área no depende del sentido del trazo", () => {
  const horario = polygonArea([point(0, 0), point(20, 0), point(20, 20), point(0, 20)], frame, unitSpacing);
  const antihorario = polygonArea([point(0, 20), point(20, 20), point(20, 0), point(0, 0)], frame, unitSpacing);
  assert.equal(horario.value, antihorario.value);
});

check("un trazo que no cierra una figura no tiene área", () => {
  assert.equal(polygonArea([point(0, 0), point(20, 0)], frame, unitSpacing), null);
});

check("el punto de adentro está adentro y el de afuera no", () => {
  const square = [point(0, 0), point(20, 0), point(20, 20), point(0, 20)];
  assert.equal(pointInPolygon(point(10, 10), square), true);
  assert.equal(pointInPolygon(point(30, 10), square), false);
});

// --- Intensidad -----------------------------------------------------------

const meta = { width: 256, height: 256 };
const pixels = new Int16Array(meta.width * meta.height);
for (let y = 0; y < meta.height; y += 1) {
  for (let x = 0; x < meta.width; x += 1) pixels[y * meta.width + x] = x < 128 ? 100 : 900;
}

check("la media y el desvío describen los píxeles de adentro del trazo", () => {
  const stats = intensityStats([point(10, 10), point(40, 10), point(40, 40), point(10, 40)], pixels, meta);
  assert.equal(Math.round(stats.mean), 100);
  assert.equal(Math.round(stats.deviation), 0);
  assert.ok(stats.count > 0);
});

check("un trazo a caballo de dos tejidos tiene desvío", () => {
  const stats = intensityStats([point(110, 10), point(150, 10), point(150, 40), point(110, 40)], pixels, meta);
  assert.ok(stats.deviation > 100, `desvio ${stats.deviation}`);
  assert.ok(stats.mean > 100 && stats.mean < 900);
});

check("la sonda devuelve la intensidad original del píxel, no la de la imagen ventaneada", () => {
  assert.equal(probeIntensity(point(10, 10), pixels, meta), 100);
  assert.equal(probeIntensity(point(200, 10), pixels, meta), 900);
});

check("una sonda fuera de la imagen no devuelve un valor", () => {
  assert.equal(probeIntensity(point(-5, 10), pixels, meta), null);
  assert.equal(probeIntensity(point(300, 10), pixels, meta), null);
});

// --- La garantía del módulo ----------------------------------------------

check("el valor recalculado desde la figura es el que se muestra", () => {
  /*
   * Es lo que hace honesto dibujar la cota: arrastrar un extremo y volver a medir
   * pasan por la misma función, así que la línea y el número no pueden separarse.
   */
  const cases = [
    ["distance", [point(10, 10), point(40, 50)]],
    ["angle", [point(0, 0), point(10, 0), point(0, 0), point(10, 10)]],
    ["listhesis", [point(10, 50), point(50, 50), point(60, 30)]],
    ["roi", [point(0, 0), point(20, 0), point(20, 20), point(0, 20)]],
  ];
  for (const [kind, points] of cases) {
    const first = recomputeValue(kind, points, frame, unitSpacing);
    const second = recomputeValue(kind, points, frame, unitSpacing);
    assert.ok(first, `${kind} tiene que producir un valor`);
    assert.equal(first.value, second.value, kind);
  }
});

check("una figura incompleta no produce un número", () => {
  assert.equal(recomputeValue("distance", [point(10, 10)], frame, unitSpacing), null);
  assert.equal(recomputeValue("angle", [point(0, 0), point(10, 0)], frame, unitSpacing), null);
  assert.equal(recomputeValue("listhesis", [point(0, 0)], frame, unitSpacing), null);
  assert.equal(recomputeValue("roi", [point(0, 0), point(10, 0)], frame, unitSpacing), null);
});

check("sin escala física, ninguna herramienta informa unidades anatómicas", () => {
  assert.equal(physicalSpacing(null), null);
  assert.equal(physicalSpacing([0, 1]), null);
  assert.equal(recomputeValue("distance", [point(0, 0), point(10, 0)], frame, null).unit, "px");
  assert.equal(recomputeValue("roi", [point(0, 0), point(20, 0), point(20, 20), point(0, 20)], frame, null).unit, "px2");
  assert.equal(recomputeValue("listhesis", [point(10, 50), point(50, 50), point(60, 30)], frame, null).unit, "px");
});

check("cada unidad se formatea con la precisión que su magnitud sostiene", () => {
  assert.equal(formatMeasurementValue(37.372, "mm"), "37.37 mm");
  assert.equal(formatMeasurementValue(42.48, "deg"), "42.5°");
  assert.equal(formatMeasurementValue(126.81, "mm2"), "126.8 mm²");
  assert.equal(formatMeasurementValue(842.4, "ua"), "842");
});

console.log(`measurement-tools: ${passed} passed`);
