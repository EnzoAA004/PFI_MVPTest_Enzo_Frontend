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
exports.slicePlaneAt = slicePlaneAt;
exports.referenceLineOn = referenceLineOn;
exports.coordinateEvidence = coordinateEvidence;
exports.parseVolumeGeometry = parseVolumeGeometry;`,
  sandbox,
);
const { referenceLineOn, coordinateEvidence, parseVolumeGeometry, slicePlaneAt } = sandbox.exports;

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

// --- La linea sigue al corte que se esta mirando ---------------------------

check("el plano se toma del corte navegado, no del que analizó la IA", () => {
  /*
   * Sin esto la línea queda quieta mientras el médico recorre la serie, que se lee
   * como que la función está rota.
   */
  const geometria = {
    slicePlane: axial(0),
    slicePositions: [[-100, -100, 0], [-100, -100, 5], [-100, -100, 75]],
  };
  assert.deepEqual(slicePlaneAt(geometria, 1).position, [-100, -100, 5]);
  assert.deepEqual(slicePlaneAt(geometria, 2).position, [-100, -100, 75]);
});

check("con posiciones declaradas no se extrapola el corte de un hueco", () => {
  // El tercer corte salta 70 mm: la cuenta uniforme lo pondría en 10.
  const geometria = {
    slicePlane: axial(0),
    slicePositions: [[-100, -100, 0], [-100, -100, 5], [-100, -100, 75]],
  };
  const linea = referenceLineOn(sagital, slicePlaneAt(geometria, 2));
  const uniforme = referenceLineOn(sagital, axial(10));
  assert.ok(linea, "el corte declarado tiene que cruzar el sagital");
  assert.notEqual(Math.round(linea[0].y), Math.round(uniforme[0].y), "la posición real y la extrapolada no coinciden");
});

check("un corte fuera de las posiciones declaradas no inventa una", () => {
  const geometria = { slicePlane: axial(0), slicePositions: [[-100, -100, 0]] };
  assert.equal(slicePlaneAt(geometria, 5), null);
});

check("sin posiciones declaradas se usa el plano informado", () => {
  const geometria = { slicePlane: axial(30), slicePositions: null };
  assert.deepEqual(slicePlaneAt(geometria, 3).position, [-100, -100, 30]);
});

// --- Orientacion por corte -------------------------------------------------

/*
 * Una serie axial lumbar no es un plano unico repetido: se adquiere en bloques
 * angulados, uno por disco. En el estudio de referencia los cortes 1-5 estan a 3,5
 * grados, los 6-10 a 5,9 y los 11-15 a 23. Usar la direccion global del volumen
 * acertaba en 5 de 15 y en el resto dibujaba 23 grados donde lo real es casi
 * horizontal, con el sentido antero-posterior invertido.
 */
const bloques = {
  slicePlane: axial(0),
  slicePositions: [[-100, -100, 0], [-100, -100, -55], [-100, -100, -120]],
  // Ya normalizadas a [fila, columna]; parseVolumeGeometry las arma asi desde los
  // seis numeros planos que declara DICOM 0020|0037.
  sliceOrientations: [
    [[1, 0, 0], [0, 0.9981, -0.0610]],
    [[1, 0, 0], [0, 0.9947, 0.1029]],
    [[1, 0, 0], [0, 0.9205, 0.3908]],
  ],
};

check("cada corte usa su propia orientacion, no la del volumen", () => {
  const primero = slicePlaneAt(bloques, 0);
  const ultimo = slicePlaneAt(bloques, 2);
  const inclinacion = (plano) => Math.acos(Math.abs(plano.normal[2])) * 180 / Math.PI;
  assert.ok(Math.abs(inclinacion(primero) - 3.5) < 0.3, `primer bloque: ${inclinacion(primero)}`);
  assert.ok(Math.abs(inclinacion(ultimo) - 23) < 0.3, `ultimo bloque: ${inclinacion(ultimo)}`);
});

check("el sentido antero-posterior de cada bloque se conserva", () => {
  // Es el signo que estaba invertido: el primer bloque se inclina hacia posterior y
  // el ultimo hacia anterior, y con una sola direccion los dos salian iguales.
  assert.ok(slicePlaneAt(bloques, 0).normal[1] > 0, "el primer bloque mira hacia posterior");
  assert.ok(slicePlaneAt(bloques, 2).normal[1] < 0, "el ultimo bloque mira hacia anterior");
});

check("cruzar de bloque cambia el angulo de la linea sobre el sagital", () => {
  const anguloDe = (indice) => {
    const linea = referenceLineOn(sagital, slicePlaneAt(bloques, indice));
    assert.ok(linea, `el corte ${indice} tiene que cruzar el sagital`);
    return Math.atan2(linea[1].y - linea[0].y, linea[1].x - linea[0].x) * 180 / Math.PI;
  };
  assert.ok(Math.abs(anguloDe(0) - anguloDe(2)) > 15, "dos bloques distintos no pueden dar la misma recta");
});

check("sin orientaciones declaradas se usa la del volumen", () => {
  // Un volumen .mha no las trae, y ahi la direccion unica es correcta por construccion.
  const sinOrientaciones = { slicePlane: axial(0), slicePositions: [[-100, -100, 5]] };
  assert.deepEqual(slicePlaneAt(sinOrientaciones, 0).normal, axial(0).normal);
});

check("una orientacion mal formada no se usa a medias", () => {
  const rota = parseVolumeGeometry({ slicePlane: null, sliceOrientations: [[1, 0, 0]] });
  assert.equal(rota.sliceOrientations, null, "seis numeros o nada");
});

check("la línea cruza la imagen entera, no media", () => {
  /*
   * Se trazaba desde el punto que resuelve el sistema hacia **un solo lado**, así que
   * era un rayo y no una recta: el recorte dejaba el corte justo donde caía ese punto.
   */
  const linea = referenceLineOn(sagital, axial(50));
  const xs = [linea[0].x, linea[1].x].sort((a, b) => a - b);
  assert.ok(xs[0] < 0.01, `la línea tiene que llegar al borde izquierdo, empieza en ${xs[0]}`);
  assert.ok(xs[1] > 255.99, `la línea tiene que llegar al borde derecho, termina en ${xs[1]}`);
});

check("recorrer el axial no mueve la línea dentro del propio axial", () => {
  /*
   * Regresión del síntoma que se veía en pantalla: al scrollear el axial, su línea
   * -que marca dónde lo cruza el sagital- se deslizaba verticalmente. Recorrer el
   * axial cambia z, y dónde lo corta un plano sagital no depende de z.
   *
   * El extremo del rayo sí dependía: se movía porque cambia la normal del plano, que
   * es una de las filas del sistema que ubica el punto.
   */
  const posiciones = [0, 10, 20, 30, 40].map((z) => {
    const linea = referenceLineOn(axial(z), sagital);
    assert.ok(linea, `el sagital tiene que cruzar el axial en z=${z}`);
    return [linea[0].x.toFixed(3), [linea[0].y, linea[1].y].sort((a, b) => a - b).map((v) => v.toFixed(3)).join("..")];
  });
  const unicas = new Set(posiciones.map((item) => item.join("|")));
  assert.equal(unicas.size, 1, `la línea se movió al recorrer el axial: ${[...unicas].join(" / ")}`);
});

console.log(`reference-line: ${passed} passed`);
