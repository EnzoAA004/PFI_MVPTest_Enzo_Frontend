/**
 * Cobertura a nivel de modulo del frontend.
 *
 * ## Por que esto y no cobertura de lineas
 *
 * Las 32 suites de `scripts/*-tests.mjs` no importan los modulos: leen el `.ts` como texto,
 * le sacan los `import`/`export` con una expresion regular, lo transpilan con
 * `ts.transpileModule` y lo evaluan dentro de un `node:vm`. Varias concatenan dos o tres
 * archivos en un solo string antes de transpilar.
 *
 * Consecuencia medida, no supuesta: `npx c8 --src=src node scripts/level-grouping-tests.mjs`
 * reporta **0%** para `src/clinicalDisplay.ts`, que es exactamente el archivo que ese test
 * ejercita. V8 atribuye cobertura por archivo ejecutado, y aca el codigo bajo prueba nunca
 * llega a ser un modulo: es un string evaluado en un contexto. Publicar ese 0% seria peor
 * que no publicar nada, porque afirmaria que codigo testeado no lo esta.
 *
 * Conseguir cobertura de lineas real exige que las suites importen los modulos, es decir
 * reescribir las 32. Es una decision de fondo y no un detalle de herramienta, asi que queda
 * como deuda registrada y no se toma de contrabando dentro del bloque de cobertura.
 *
 * ## Que mide esto entonces
 *
 * Que modulos de `src/` son ejercitados por al menos una suite, agrupados por area. Responde
 * la pregunta que importa para el riesgo -que codigo no tiene ninguna prueba- sin mentir
 * sobre la profundidad de las que existen. Un modulo "cubierto" aca puede tener una sola
 * asercion: esto no dice cuanto se prueba, dice si se prueba.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "src";
const SCRIPTS = "scripts";

const AREAS = [
  ["API y servicios", (f) => /(^src\/(api|authClient)\.ts$)|Api\.ts$|^src\/adapters\//.test(f)],
  ["Seguridad", (f) => f.startsWith("src/security/")],
  ["Logica de presentacion", (f) =>
    /^src\/(viewModels|selectors)\//.test(f) ||
    /^src\/(clinicalDisplay|appDataGuards|inferenceReadiness|dataMode)\.ts$/.test(f) ||
    (f.startsWith("src/features/") && f.endsWith(".ts"))],
  ["Componentes", (f) => f.endsWith(".tsx")],
  ["Contratos y tipos", (f) => /^src\/(contracts|data)\//.test(f) || /^src\/appTypes\.ts$/.test(f)],
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.posix.join(dir.split(path.sep).join("/"), entry.name);
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name)));
    else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

const modules = walk(SRC).sort();

// Todo `"src/...ts"` que aparezca en una suite cuenta como modulo ejercitado.
const referenced = new Set();
for (const file of fs.readdirSync(SCRIPTS)) {
  if (!file.endsWith("-tests.mjs")) continue;
  const body = fs.readFileSync(path.join(SCRIPTS, file), "utf8");
  for (const m of body.matchAll(/["'`](src\/[^"'`]+\.tsx?)["'`]/g)) referenced.add(m[1]);
}

const rows = [];
const seen = new Set();
for (const [name, match] of AREAS) {
  const files = modules.filter((f) => !seen.has(f) && match(f));
  files.forEach((f) => seen.add(f));
  const covered = files.filter((f) => referenced.has(f));
  if (files.length) rows.push([name, covered.length, files.length]);
}
const rest = modules.filter((f) => !seen.has(f));
if (rest.length) rows.push(["Otros", rest.filter((f) => referenced.has(f)).length, rest.length]);

const totalCovered = modules.filter((f) => referenced.has(f)).length;
const pct = (c, t) => (t ? `${((100 * c) / t).toFixed(1)}%` : "n/a");

const md = [];
md.push("## Cobertura del frontend (a nivel de modulo)\n");
md.push(
  `**${totalCovered} de ${modules.length} modulos** de \`src/\` son ejercitados por al menos ` +
    `una de las ${fs.readdirSync(SCRIPTS).filter((f) => f.endsWith("-tests.mjs")).length} suites ` +
    `— ${pct(totalCovered, modules.length)}.\n`,
);
md.push("| Area | Modulos con test | Total | % |");
md.push("|---|---:|---:|---:|");
for (const [name, c, t] of rows) md.push(`| ${name} | ${c} | ${t} | ${pct(c, t)} |`);
md.push(`| **Total** | **${totalCovered}** | **${modules.length}** | **${pct(totalCovered, modules.length)}** |`);
md.push(
  "\n> No es cobertura de lineas. Las suites evaluan el codigo dentro de un `node:vm`, que " +
    "V8 no atribuye a los archivos de `src/`: medido con c8, `clinicalDisplay.ts` da 0% aunque " +
    "tenga tests. Esto mide que modulos tienen alguna prueba, no cuanto de cada uno se prueba.\n",
);

const sinTest = modules.filter((f) => !referenced.has(f));
if (sinTest.length) {
  md.push(`<details><summary>${sinTest.length} modulos sin ninguna suite</summary>\n`);
  for (const f of sinTest) md.push(`- \`${f}\``);
  md.push("\n</details>");
}

const out = md.join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n`);
}
