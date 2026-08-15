import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worklist = readFileSync("src/features/worklist/Worklist.tsx", "utf8");
const worklistCss = readFileSync("src/features/worklist/worklist.css", "utf8");
const shellCss = readFileSync("src/design/shell.css", "utf8");
const tokens = readFileSync("src/design/tokens.css", "utf8");
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
const statusBadge = readFileSync("src/components/StatusBadge.tsx", "utf8");
const pageHeader = readFileSync("src/components/OperationsPageHeader.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

test("Operations define una superficie light sin cambiar el tema reading", () => {
  assert.match(tokens, /--operations-canvas:/);
  assert.match(tokens, /\[data-theme="reading"\]/);
});

test("los tokens incluyen surface, border y accent clínico compartidos", () => {
  assert.match(tokens, /--surface-elevated:/);
  assert.match(tokens, /--border-subtle:/);
  assert.match(tokens, /--clinical-accent:/);
});

test("la escala incorpora radios y transición compactos", () => {
  assert.match(tokens, /--radius-sm:/);
  assert.match(tokens, /--radius-md:/);
  assert.match(tokens, /--transition-fast:/);
});

test("Worklist usa el page header operativo reutilizable", () => {
  assert.match(worklist, /<OperationsPageHeader/);
  assert.match(pageHeader, /operations-page-header/);
});

/*
 * UI-PR1 fijaba acá un antetítulo "ESTUDIOS" y la bajada "Revisión y
 * seguimiento de estudios procesados". Las dos salieron en la pasada de
 * densidad: la barra lateral ya dice en qué sección está el usuario, y
 * describir la pantalla a quien la está mirando cuesta ~40 px de alto, que en
 * una lista de trabajo es una fila menos visible.
 *
 * Lo que el test protege sigue siendo lo mismo —que el encabezado identifique
 * la pantalla y ofrezca la acción primaria—; lo que cambia es que ya no fija
 * el texto decorativo que lo acompañaba.
 */
test("el header identifica la pantalla y ofrece la acción primaria", () => {
  assert.match(worklist, /title="Lista de trabajo"/);
  assert.match(worklist, /Nuevo análisis/);
  assert.doesNotMatch(worklist, /eyebrow=/);
});

test("el encabezado operativo no impone antetítulo ni bajada", () => {
  assert.doesNotMatch(pageHeader, /operations-eyebrow/);
  assert.match(pageHeader, /description\?: string/);
  assert.match(pageHeader, /description \? <p>\{description\}<\/p> : null/);
});

test("la búsqueda mantiene label accesible y control search", () => {
  assert.match(worklist, /aria-label="Buscar estudios"/);
  assert.match(worklist, /type="search"/);
});

test("los contadores siguen siendo filtros accionables", () => {
  assert.match(worklist, /aria-pressed=\{filter\.id === filterId\}/);
  assert.match(worklist, /counts\[filter\.id\]/);
});

test("la tabla conserva sorting accesible", () => {
  assert.match(worklist, /aria-sort=/);
  assert.match(worklist, /changeSort\(column\)/);
});

test("la fila conserva apertura con Enter y Space", () => {
  assert.match(worklist, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(worklist, /aria-label=\{`Abrir estudio/);
});

test("la tabla conserva caseId como identidad funcional visible", () => {
  assert.match(worklist, /study\.caseId/);
  assert.doesNotMatch(worklist, /navigate\([^)]*study\.id/);
});

test("los estados combinan marcador y texto", () => {
  assert.match(statusBadge, /study-status-mark/);
  assert.match(statusBadge, /displayReviewStatus\(status\)/);
});

test("los estados no dependen sólo del color", () => {
  assert.match(worklist, /<ReviewBadge status=\{study\.reviewStatus\}/);
});

test("loading usa copy de producto y aria-live", () => {
  assert.match(worklist, /Cargando estudios…/);
  assert.match(worklist, /aria-live="polite"/);
});

test("empty search no refleja datos técnicos del query", () => {
  assert.match(worklist, /No hay estudios para esta búsqueda\./);
  assert.doesNotMatch(worklist, /Ningún estudio coincide con.*query\.trim/);
});

test("el error visible de Worklist no filtra detalle backend", () => {
  assert.match(app, /No se pudo cargar la lista de estudios\./);
  assert.match(app, /frontendLogger\.error\("\[worklist\]/);
  assert.doesNotMatch(app, /setStudiesError\([^)]*detail/);
});

test("mobile transforma filas en cards sin cambiar el DOM tabular", () => {
  assert.match(worklistCss, /@media \(max-width: 700px\)/);
  assert.match(worklistCss, /\.wl-row\s*\{[\s\S]*?display: grid;/);
  assert.match(worklist, /<table className="wl-table">/);
});

test("las celdas mobile tienen labels reales", () => {
  for (const label of ["Caso", "Paciente", "Fecha", "Planos", "Revisión", "Prioridad"]) {
    assert.match(worklist, new RegExp(`data-label="${label}"`));
  }
  assert.doesNotMatch(worklist, /data-label="Modelo"|>Modelo</);
});

test("sidebar conserva aria-current y añade separación de Settings", () => {
  assert.match(sidebar, /aria-current=\{selected \? "page"/);
  assert.match(sidebar, /side-nav-separator/);
});

test("sidebar móvil conserva tres destinos sin navegación nueva", () => {
  assert.match(shellCss, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(sidebar, /Comparar|Historia clínica|Tendencias/);
});

test("el drawer de New Analysis continúa montándose sin cambio de lifecycle", () => {
  assert.match(worklist, /<NewAnalysisDrawer/);
  assert.match(worklist, /onAnalysisReady=\{\(caseId\)/);
});

console.log(`UI-PR1 clinical operations tests: ${count} passed`);
