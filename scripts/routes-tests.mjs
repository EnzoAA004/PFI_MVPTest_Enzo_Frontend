import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

/**
 * Mapeo entre URLs y vistas. Lo que se verifica es que la URL pueda ser la fuente
 * de verdad de la navegación: que toda vista tenga una ruta, que toda ruta
 * resuelva a una vista usable, y que un caseId sobreviva el viaje de ida y vuelta
 * aunque tenga caracteres que haya que escapar.
 */
const source = fs.readFileSync("src/routes.ts", "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/export /g, "");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const sandbox = { exports: {}, console };
vm.runInNewContext(`${js}
exports.ROUTES = ROUTES;
exports.pathForView = pathForView;
exports.pathForStudy = pathForStudy;
exports.viewForPath = viewForPath;
exports.caseIdFromPath = caseIdFromPath;
exports.pathForPatient = pathForPatient;
exports.patientIdFromPath = patientIdFromPath;`, sandbox);

const { ROUTES, pathForView, pathForStudy, viewForPath, caseIdFromPath, pathForPatient, patientIdFromPath } = sandbox.exports;

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

test("A dashboard, studies y queue comparten la ruta de la lista de trabajo", () => {
  assert.equal(pathForView("dashboard"), ROUTES.worklist);
  assert.equal(pathForView("studies"), ROUTES.worklist);
  assert.equal(pathForView("queue"), ROUTES.worklist);
});

test("B ayuda e historial dejaron de ser destinos: comparten ruta con su contenedor", () => {
  assert.equal(pathForView("settings"), ROUTES.settings);
  // El historial es el detalle de Paciente, no un destino aparte.
  assert.equal(pathForView("history"), ROUTES.patients);
  assert.equal(pathForView("patients"), ROUTES.patients);
});

test("C toda ruta conocida vuelve a su vista", () => {
  assert.equal(viewForPath(ROUTES.worklist), "dashboard");
  assert.equal(viewForPath(ROUTES.patients), "patients");
  assert.equal(viewForPath(ROUTES.settings), "settings");
  assert.equal(viewForPath(ROUTES.study), "review");
});

test("C2 Paciente tiene lista y detalle bajo el mismo destino", () => {
  assert.equal(viewForPath(ROUTES.patients), "patients");
  assert.equal(viewForPath(`${ROUTES.patients}/`), "patients");
  assert.equal(viewForPath(pathForPatient("11111111-1111-4111-8111-111111111111")), "history");
});

test("C3 el patientId sobrevive el viaje de ida y vuelta", () => {
  for (const patientId of ["11111111-1111-4111-8111-111111111111", "patient interno", "a/b"]) {
    assert.equal(patientIdFromPath(pathForPatient(patientId)), patientId);
  }
});

test("C4 la lista de pacientes no tiene objetivo, y un escape invalido no rompe", () => {
  assert.equal(patientIdFromPath(ROUTES.patients), undefined);
  assert.equal(patientIdFromPath(`${ROUTES.patients}/`), undefined);
  assert.doesNotThrow(() => patientIdFromPath(`${ROUTES.patients}/%E0%A4%A`));
  assert.equal(patientIdFromPath(`${ROUTES.patients}/%E0%A4%A`), undefined);
});

test("C5 Ayuda ya no es un destino del menu", () => {
  const sidebar = fs.readFileSync("src/components/Sidebar.tsx", "utf8");
  assert.ok(!sidebar.includes('onChangeView("help")'), "el menu no debe llevar a Ayuda");
  const appTypes = fs.readFileSync("src/appTypes.ts", "utf8");
  assert.ok(!/ViewKey =[^;]*"help"/.test(appTypes), "help no debe seguir siendo una ViewKey");
});

test("D una ruta desconocida cae en la lista de trabajo, no en pantalla vacia", () => {
  assert.equal(viewForPath("/"), "dashboard");
  assert.equal(viewForPath("/no-existe"), "dashboard");
  assert.equal(viewForPath(""), "dashboard");
});

test("E /estudio/:caseId resuelve a la sala de lectura", () => {
  assert.equal(viewForPath(pathForStudy("CASE-1")), "review");
});

test("F el caseId sobrevive el viaje de ida y vuelta, incluso con caracteres escapados", () => {
  for (const caseId of ["CASE-1", "Caso prueba", "jnjm, mn", "a/b", "100%"]) {
    assert.equal(caseIdFromPath(pathForStudy(caseId)), caseId, `falla con "${caseId}"`);
  }
});

test("G sin caseId la ruta de estudio no inventa uno", () => {
  assert.equal(caseIdFromPath(ROUTES.study), undefined);
  assert.equal(caseIdFromPath(`${ROUTES.study}/`), undefined);
  assert.equal(caseIdFromPath(ROUTES.worklist), undefined);
});

test("H un caseId mal escapado no rompe la navegacion", () => {
  // %E0%A4%A no es una secuencia válida: debe devolver undefined en vez de lanzar.
  assert.doesNotThrow(() => caseIdFromPath(`${ROUTES.study}/%E0%A4%A`));
  assert.equal(caseIdFromPath(`${ROUTES.study}/%E0%A4%A`), undefined);
});

test("I App deriva la vista de la URL y no mantiene setActiveView", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8");
  assert.match(app, /const activeView: ViewKey = viewForPath\(location\.pathname\)/);
  assert.ok(!app.includes("setActiveView"), "activeView no debe poder cambiarse por fuera de la URL");
});

test("J el estudio seleccionado ya no viaja por sessionStorage", () => {
  assert.equal(fs.existsSync("src/selectedStudyStorage.ts"), false);
  const app = fs.readFileSync("src/App.tsx", "utf8");
  const review = fs.readFileSync("src/components/StudyReviewView.tsx", "utf8");
  const worklist = fs.readFileSync("src/features/worklist/Worklist.tsx", "utf8");
  for (const [name, src] of [["App", app], ["StudyReviewView", review], ["Worklist", worklist]]) {
    assert.ok(!src.includes("SELECTED_STUDY_EVENT"), `${name} no debe usar el bus de eventos`);
    assert.ok(!src.includes("saveSelectedStudyDetail"), `${name} no debe escribir el detalle en storage`);
  }
});

test("K nginx sirve index.html para rutas profundas (deep links no dan 404)", () => {
  const conf = fs.readFileSync("docker/nginx.conf", "utf8");
  assert.match(conf, /try_files \$uri \$uri\/ \/index\.html;/);
});

console.log(`Routes tests passed: ${count}`);
