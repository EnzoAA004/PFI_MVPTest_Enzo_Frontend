import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), "utf8");

const api = read("src/api.ts");
const app = read("src/App.tsx");
const studyApi = read("src/studyApi.ts");
const storage = read("src/storage.ts");
const selectedStudyStorage = read("src/selectedStudyStorage.ts");

function assertNotContains(fileName, source, pattern, message) {
  assert.equal(pattern.test(source), false, `${fileName}: ${message}`);
}

function assertContains(fileName, source, pattern, message) {
  assert.equal(pattern.test(source), true, `${fileName}: ${message}`);
}

assertNotContains("src/api.ts", api, /^import .*mockMeasurements/m, "api real no debe importar mockMeasurements estaticamente");
assertNotContains("src/api.ts", api, /^import .*worklistStudies/m, "api real no debe importar worklistStudies estaticamente");
assertNotContains("src/api.ts", api, /^import .*sampleRun/m, "api real no debe importar sampleRun estaticamente");
assertContains("src/api.ts", api, /isDemoDataMode[\s\S]*await import\("\.\/data\/mockStudies"\)/, "fixtures de estudios deben quedar detras de modo demo");
assertContains("src/api.ts", api, /isDemoDataMode[\s\S]*await import\("\.\/mock\/sampleRun"\)/, "sampleRun debe quedar detras de modo demo");
assertContains("src/api.ts", api, /class ApiError extends Error/, "request real debe propagar ApiError estructurado");
assertContains("src/api.ts", api, /class ContractError extends Error/, "normalizadores deben poder reportar ContractError");
assertNotContains("src/api.ts", api, /catch \(error\) \{\s*if \(fallback\)/, "request real no debe caer silenciosamente a fallback");
assertContains("src/api.ts", api, /metadata: "real_baseline"|inferenceMode: "real_baseline"/, "real_baseline debe conservar metadata estricta");
assertContains("src/api.ts", api, /allowContractFallback: false/, "real_baseline debe deshabilitar contract fallback");
assertNotContains("src/api.ts", api, /pipeline-status/, "no se debe fabricar medicion pipeline-status");

assertNotContains("src/App.tsx", app, /sampleRun|worklistStudies|initialAuditTrail|getDemoStudyReview/, "App real no debe importar fixtures ni demo-review");
assertContains("src/App.tsx", app, /useState<AiRunResponse \| null>\(null\)/, "App inicial debe permitir selectedRun=null");
assertContains("src/App.tsx", app, /useState<Measurement\[\]>\(\[\]\)/, "App inicial debe iniciar measurements=[]");
assertContains("src/App.tsx", app, /EmptyReviewState/, "Review debe tener empty state cuando no hay corrida");
assertNotContains("src/App.tsx", app, /inputPath:\s*`demo\//, "abrir estudio no debe construir inputPath demo");
assertNotContains("src/App.tsx", app, /PAT-0087|CASE-DEMO|demo-run-2026-001|local-run/, "App real no debe usar IDs demo/fallback visibles");
assertContains("src/App.tsx", app, /Error al consultar estudios|No se pudo consultar el backend/, "backend 500 debe mostrar error humano");

assertNotContains("src/studyApi.ts", studyApi, /mockMeasurements|worklistStudies|demo-run|status: "demo"/, "studyApi no debe fabricar detalle/runs/mediciones");
assertContains("src/studyApi.ts", studyApi, /throw new ApiError/, "fetchStudyDetail/fetchStudyRuns deben propagar errores backend");
assertContains("src/studyApi.ts", studyApi, /throw new ContractError/, "contratos incompletos deben fallar explicitamente");

assertNotContains("src/storage.ts", storage, /initialAuditTrail|local-run/, "storage real no debe sembrar auditoria demo ni runs locales");
assertContains("src/storage.ts", storage, /patientStudies:\s*\[\]/, "storage real debe iniciar patientStudies vacio");
assertNotContains("src/selectedStudyStorage.ts", selectedStudyStorage, /demo-run/, "selected study fallback no debe fabricar runId demo");

console.log("data-mode separation tests: ok");
