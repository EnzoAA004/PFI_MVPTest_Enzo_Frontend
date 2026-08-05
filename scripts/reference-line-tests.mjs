import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Línea de referencia entre planos.
 *
 * Lo que más se protege acá no es que la línea se dibuje, sino que **no se dibuje**
 * cuando la geometría no la sostiene. Una línea sobre coordenadas no comparables se ve
 * exactamente igual de convincente que una correcta, y afirma dónde está una
 * estructura del paciente.
 */
const source = fs.readFileSync("src/features/reading/referenceLine.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, console };
vm.runInNewContext(
  `${js}
exports.referenceLineOn = referenceLineOn;
exports.coordinateEvidence = coordinateEvidence;
exports.parseVolumeGeometry = parseVolumeGeometry;`,
  sandbox,
);
const { referenceLineOn, coordinateEvidence, parseVolumeGeometry } = sandbox.exports;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; };

/** Sagital: el corte mira hacia -x; sus filas van en +z y sus columnas en +y. */
const sagital = {
  position: [0, -100, 100], rowDirection: [0, 0, -1], colDirection: [0, 1, 0], normal: [-1, 0, 0],
  rowSpacing: 1, colSpacing: 1, rowCount: 200, colCount: 200,
};
/** Axial: mira hacia +z; filas en +y, columnas en +x. */
const axial = (z) => ({
  position: [-100, -100, z], rowDirection: [0, 1, 0], colDirection: [1, 0, 0], normal: [0, 0, 1],
  rowSpacing: 1, colSpacing: 1, rowCount: 200, colCount: 200,
});

check("el axial corta el sagital en una línea horizontal a su altura", () => {
  // El corte axial en z=50 tiene que cruzar el sagital a 50 mm por debajo del borde
  // superior, que en la base 0..256 son 64 unidades.
  const line = referenceLineOn(sagital, axial(50));
  assert.ok(line, "los planos son perpendiculares: tienen que cortarse");
  assert.equal(Math.round(line[0].y), 64);
  assert.equal(Math.round(line[1].y), 64);
  assert.notEqual(Math.round(line[0].x), Math.round(line[1].x), "la línea cruza la imagen, no es un punto");
});

check("mover el corte axial mueve la línea sobre el sagital", () => {
  const arriba = referenceLineOn(sagital, axial(80));
  const abajo = referenceLineOn(sagital, axial(20));
  assert.ok(arriba[0].y < abajo[0].y, "un corte más alto en z va más arriba en la imagen");
});

check("la línea se recorta al borde de la imagen y no se sale", () => {
  const line = referenceLineOn(sagital, axial(50));
  for (const point of line) {
    assert.ok(point.x >= -0.01 && point.x <= 256.01, `x fuera de la base: ${point.x}`);
    assert.ok(point.y >= -0.01 && point.y <= 256.01, `y fuera de la base: ${point.y}`);
  }
});

check("un corte axial fuera de la imagen no dibuja una línea pegada al borde", () => {
  /*
   * Es el caso normal de un estudio lumbar: los axiales cubren solo la parte baja, así
   * que al subir por el sagital la línea deja de existir. Dibujarla igual, aplastada
   * contra el borde, diría que el axial corta donde no corta.
   */
  assert.equal(referenceLineOn(sagital, axial(500)), null);
  assert.equal(referenceLineOn(sagital, axial(-500)), null);
});

check("dos planos paralelos no producen línea", () => {
  const otroSagital = { ...sagital, position: [30, -100, 100] };
  assert.equal(referenceLineOn(sagital, otroSagital), null);
});

check("un axial inclinado da una línea inclinada", () => {
  // Los axiales lumbares se angulan al disco: la línea no puede salir siempre recta.
  const inclinado = { ...axial(50), normal: [0, -0.5, 0.866] };
  const line = referenceLineOn(sagital, inclinado);
  assert.ok(line, "un plano inclinado sigue cortando al sagital");
  assert.ok(Math.abs(line[0].y - line[1].y) > 1, "la línea tiene que estar inclinada");
});

// --- El guard, que es lo que decide si se dibuja algo ----------------------

const caja = (min, max) => ({ min, max });
const completo = (extra) => ({ geometryComplete: true, boundsMm: caja([-50, -50, -50], [50, 50, 50]), ...extra });

check("con el mismo marco de referencia no hace falta más evidencia", () => {
  const verdict = coordinateEvidence(
    completo({ frameOfReferenceUid: "1.2.3" }),
    completo({ frameOfReferenceUid: "1.2.3" }),
  );
  assert.deepEqual({ ...verdict }, { shared: true, basis: "frame_of_reference" });
});

check("sin marco compartido se verifica por geometría", () => {
  /*
   * Es el caso de este dataset: la anonimización regenera el identificador por serie,
   * las coordenadas siguen siendo coherentes y el identificador ya no lo dice.
   * Confiar solo en él rechazaría geometría buena en los 516 casos.
   */
  const verdict = coordinateEvidence(
    completo({ frameOfReferenceUid: "1.2.3" }),
    completo({ frameOfReferenceUid: "9.9.9" }),
  );
  assert.deepEqual({ ...verdict }, { shared: true, basis: "geometry" });
});

check("dos estudios distintos no pasan la verificación geométrica", () => {
  const lejos = { geometryComplete: true, boundsMm: caja([300, 300, 300], [400, 400, 400]), frameOfReferenceUid: "9.9.9" };
  const verdict = coordinateEvidence(completo({ frameOfReferenceUid: "1.2.3" }), lejos);
  assert.equal(verdict.shared, false);
  assert.match(verdict.reason, /no ocupan el mismo espacio/);
});

check("un solape que no contiene los centros tampoco alcanza", () => {
  // Cajas que se tocan en una esquina: hay solape, pero no son el mismo estudio.
  const esquina = { geometryComplete: true, boundsMm: caja([40, 40, 40], [140, 140, 140]), frameOfReferenceUid: "9.9.9" };
  assert.equal(coordinateEvidence(completo({ frameOfReferenceUid: "1.2.3" }), esquina).shared, false);
});

check("sin geometría completa no se verifica nada", () => {
  const verdict = coordinateEvidence(completo({ geometryComplete: false }), completo({}));
  assert.equal(verdict.shared, false);
  assert.match(verdict.reason, /geometría completa/);
});

check("sin cajas y sin marco compartido no se puede afirmar nada", () => {
  const verdict = coordinateEvidence(
    { geometryComplete: true, frameOfReferenceUid: "1.2.3" },
    { geometryComplete: true, frameOfReferenceUid: "9.9.9" },
  );
  assert.equal(verdict.shared, false);
});

// --- Lectura del contrato -------------------------------------------------

check("una geometría a medias no se usa a medias", () => {
  assert.equal(parseVolumeGeometry(null), null);
  const parcial = parseVolumeGeometry({ slicePlane: { position: [1, 2, 3] }, geometryComplete: true });
  assert.equal(parcial.slicePlane, null, "un plano sin direcciones no sirve para cruzar nada");
});

check("se conserva de dónde salió la posición del corte", () => {
  const parsed = parseVolumeGeometry({
    slicePlane: {
      position: [0, 0, 0], rowDirection: [0, 0, -1], colDirection: [0, 1, 0], normal: [-1, 0, 0],
      rowSpacing: 1, colSpacing: 1, rowCount: 10, colCount: 10, positionSource: "declared",
    },
    geometryComplete: true,
  });
  assert.equal(parsed.slicePlane.positionSource, "declared");
});

console.log(`reference-line: ${passed} passed`);
