import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const port = 5203;
const appUrl = `http://127.0.0.1:${port}`;
const backendUrl = "http://localhost:8080";
const authKey = "lumbar-mri-auth-session-v1";
const caseId = "CASE-PATIENT-PR3-E2E";
const runId = "run-patient-pr3-e2e";
const finalHash = "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944";
const evidenceDir = process.env.PATIENT_PR3_EVIDENCE_DIR;

function assertTruthy(value, message) {
  if (!value) throw new Error(`Patient PR3 E2E: ${message}`);
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function serveDist() {
  const dist = path.resolve("dist");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", appUrl);
    const requestedPath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const candidate = path.join(dist, requestedPath === "/" ? "index.html" : requestedPath);
    const filePath = candidate.startsWith(dist) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(dist, "index.html");
    response.setHeader("Content-Type", contentType(filePath));
    fs.createReadStream(filePath).pipe(response);
  });
  server.listen(port, "127.0.0.1");
  return server;
}

function patient(id, patientReference) {
  return {
    id,
    patientReference,
    createdAt: "2026-08-12T12:00:00Z",
    updatedAt: "2026-08-12T12:00:00Z",
  };
}

function canonicalRunResponse() {
  const labels = [
    "vertebra_group area",
    "vertebra_group width",
    "vertebra_group height",
    "canal area",
    "canal width",
    "canal height",
    "disc_group area",
    "disc_group width",
    "disc_group height",
  ];
  return {
    status: "completed",
    schemaVersion: "pfi.multiplanar-run.v2",
    runId,
    traceId: "trace-patient-pr3-e2e",
    caseId,
    workspaceMode: "sagittal_only",
    requestedInferenceMode: "real_baseline",
    effectiveInferenceMode: "real_baseline",
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    degradedMode: false,
    planes: {
      sagittal: {
        runId: `${runId}-sagittal`,
        plane: "sagittal",
        status: "completed",
        effectiveInferenceMode: "real_baseline",
        degradedMode: false,
        allowContractFallback: false,
        humanReviewRequired: true,
        notClinicalDiagnosis: true,
        modelKey: "sagittal_spider",
        modelVersion: "sagittal-spider-final-v1",
        artifactHash: finalHash,
        coordinateSpace: "canonical_voxel",
        modelArtifact: { baselineReady: true, availableForRealInference: true },
        aiOutput: { synthetic: false, fallbackReason: null, realInferenceAvailable: true },
        metadata: {
          synthetic: false,
          fallbackReason: null,
          inputId: "input-sagittal-patient-pr3",
          inputShapeNative: [17, 512, 512],
          inputShapeCanonical: [512, 512, 17],
          inputOrientationTransform: "move_axis_0_to_last",
          selectedSlice: 8,
          sliceCount: 17,
          selectedAxis: 2,
          inPlaneSpacing: [0.8, 0.8],
        },
        assets: {},
        masks: [],
        landmarks: [],
        measurements: labels.map((labelKey, index) => ({
          id: `m-${index + 1}`,
          labelKey,
          value: 12 + index,
          unit: labelKey.endsWith("area") ? "mm2" : "mm",
          confidence: 0.91,
          placeholder: false,
        })),
        quality: { status: "ok", warnings: [] },
      },
    },
  };
}

async function seedSession(page) {
  const session = {
      accessToken: "patient-pr3-token",
      refreshToken: "patient-pr3-refresh",
      tokenType: "Bearer",
      user: {
        id: "professional-patient-pr3",
        fullName: "Profesional QA",
        email: "qa@example.test",
        licenseNumber: "MP-QA",
        specialty: "Radiologia",
        institution: "QA",
        roles: ["DOCTOR"],
        verified: true,
        approved: true,
        onboardingCompleted: true,
      },
    };
  await page.goto(appUrl);
  await page.evaluate(({ key, value }) => new Promise((resolve, reject) => {
    const request = indexedDB.open("lumbar-mri-analysis-storage", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("kv", "readwrite");
      transaction.objectStore("kv").put(JSON.stringify(value), key);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        database.close();
        resolve(undefined);
      };
    };
  }), { key: authKey, value: session });
  await page.reload();
}

async function installBackendMocks(page, options = {}) {
  const patients = options.patients ?? [patient("11111111-1111-4111-8111-111111111111", "PAC-001")];
  const calls = { association: [], create: [], delete: 0, run: 0, search: [] };
  let remainingAssociationFailures = options.associationFailures ?? 0;
  let remainingRunFailures = options.runFailures ?? 0;
  const jsErrors = [];
  page.on("pageerror", (error) => jsErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") jsErrors.push(message.text());
  });
  await page.route(`${backendUrl}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    const method = request.method();
    if (method === "DELETE") calls.delete += 1;
    if (apiPath === "/api/system/health") return route.fulfill({ json: { status: "ok" } });
    if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
    if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
    if (apiPath === "/api/studies") {
      return route.fulfill({ json: { status: "ok", source: "postgres-domain", dataOrigin: "database", items: [], summary: { total: 0, pending: 0, completed: 0, flagged: 0 }, humanReviewRequired: true, notClinicalDiagnosis: true } });
    }
    if (apiPath === "/api/patients" && method === "GET") {
      const query = (url.searchParams.get("query") ?? "").trim().toLocaleLowerCase("en-US");
      calls.search.push(query);
      if (options.searchDelayMs) await new Promise((resolve) => setTimeout(resolve, options.searchDelayMs));
      return route.fulfill({ json: patients.filter((entry) => entry.patientReference.toLocaleLowerCase("en-US").startsWith(query)) });
    }
    if (apiPath === "/api/patients" && method === "POST") {
      const body = request.postDataJSON();
      calls.create.push(body);
      const duplicate = patients.find((entry) => entry.patientReference.trim().toLocaleLowerCase("en-US") === body.patientReference.trim().toLocaleLowerCase("en-US"));
      if (duplicate) return route.fulfill({ status: 409, json: { code: "DUPLICATE_PATIENT_REFERENCE", message: "Conflict", traceId: "trace-duplicate" } });
      const created = patient("33333333-3333-4333-8333-333333333333", body.patientReference.trim());
      patients.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    if (apiPath.startsWith("/api/patients/") && method === "GET") {
      const found = patients.find((entry) => apiPath.endsWith(entry.id));
      return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { code: "PATIENT_NOT_FOUND", message: "Not found" } });
    }
    if (apiPath === "/api/ai/inputs" && method === "POST") {
      return route.fulfill({ json: { inputId: "input-sagittal-patient-pr3", caseId, plane: "sagittal", format: "dicom", size: 128 } });
    }
    if (apiPath === "/api/ai/multiplanar/run" && method === "POST") {
      calls.run += 1;
      if (remainingRunFailures > 0) {
        remainingRunFailures -= 1;
        return route.fulfill({ status: 500, json: { code: "AI_UNAVAILABLE", message: "Internal", traceId: "trace-run-error" } });
      }
      return route.fulfill({ json: canonicalRunResponse() });
    }
    if (apiPath === `/api/studies/${caseId}/patient` && method === "PUT") {
      const body = request.postDataJSON();
      calls.association.push(body);
      if (options.assignmentConflict) return route.fulfill({ status: 409, json: { code: "PATIENT_ASSIGNMENT_CONFLICT", message: "Conflict", traceId: "trace-assignment-conflict" } });
      if (remainingAssociationFailures > 0) {
        remainingAssociationFailures -= 1;
        return route.fulfill({ status: 500, json: { code: "INTERNAL_ERROR", message: "Internal", traceId: "trace-assignment-error" } });
      }
      return route.fulfill({ json: { studyId: "44444444-4444-4444-8444-444444444444", caseId, patientId: body.patientId, previousPatientId: null, reasonCode: body.reason, changed: calls.association.length === 1 } });
    }
    return route.fulfill({ json: {} });
  });
  return { calls, jsErrors };
}

async function openNewAnalysis(page) {
  if (!page.url().startsWith(appUrl)) await page.goto(appUrl);
  await page.waitForSelector("text=Lista de trabajo", { timeout: 10000 }).catch(async (error) => {
    console.error("Patient PR3 E2E page state:", page.url(), await page.locator("body").innerText());
    throw error;
  });
  await page.locator("button", { hasText: /Nuevo an/ }).first().click();
  await page.locator('.wl-drawer[aria-label="Nuevo análisis"]').waitFor({ state: "visible", timeout: 10000 });
}

async function assertResponsive(page, width, height) {
  await page.setViewportSize({ width, height });
  const dimensions = await page.locator(".wl-drawer").evaluate((element) => ({
    bodyScrollWidth: document.documentElement.scrollWidth,
    bodyWidth: document.documentElement.clientWidth,
    drawerRight: element.getBoundingClientRect().right,
    drawerWidth: element.getBoundingClientRect().width,
  }));
  assertTruthy(dimensions.bodyScrollWidth <= dimensions.bodyWidth, `${width}x${height} no debe tener overflow horizontal`);
  assertTruthy(dimensions.drawerRight <= width + 1, `${width}x${height} debe mantener el drawer dentro del viewport`);
  assertTruthy(dimensions.drawerWidth <= width, `${width}x${height} debe mantener un ancho utilizable`);
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `patient-pr3-${width}x${height}.png`), fullPage: true });
  }
}

async function runExistingPatientAndAssociationRetry(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const state = await installBackendMocks(page, { associationFailures: 1, searchDelayMs: 250 });
  await seedSession(page);
  await openNewAnalysis(page);

  const fileInputs = page.locator('input[type="file"]');
  assertTruthy(await fileInputs.first().isDisabled(), "la carga debe estar deshabilitada sin Patient");
  const search = page.getByPlaceholder("PAC-00");
  await search.fill("pac");
  await page.waitForSelector("text=Buscando pacientes");
  await page.waitForSelector("text=PAC-001");
  assertTruthy(await page.locator("text=Paciente seleccionado").count() === 0, "la busqueda no debe auto-seleccionar");
  await page.getByRole("button", { name: "PAC-001" }).click();
  await page.waitForSelector("text=Paciente seleccionado");

  await page.getByPlaceholder("CASE-XXXX").fill(caseId);
  await page.locator("button", { hasText: "Cargar un archivo por plano" }).click();
  await fileInputs.nth(1).setInputFiles({ name: "sagittal.dcm", mimeType: "application/dicom", buffer: Buffer.from("deidentified-e2e") });
  await page.waitForSelector("text=sagittal.dcm cargado");
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.waitForSelector("text=Análisis completado, pero no se pudo asociar el estudio al paciente", { timeout: 10000 });
  assertTruthy(state.calls.run === 1 && state.calls.association.length === 1, "el exito parcial debe ejecutar un run y un PUT");
  await page.getByRole("button", { name: "Reintentar asociación" }).click();
  await page.waitForSelector("text=Study asociado correctamente");
  assertTruthy(state.calls.run === 1, "reintentar asociación no debe reejecutar AI");
  assertTruthy(state.calls.create.length === 0, "reintentar asociación no debe recrear Patient");
  assertTruthy(state.calls.association.length === 2, "reintentar asociación debe repetir solo el PUT");
  assertTruthy(state.calls.association[0].expectedPatientId === null, "la primera asociación debe ser optimista desde null");
  assertTruthy(state.calls.association[0].reason === "INITIAL_ASSIGNMENT", "la primera asociación debe usar INITIAL_ASSIGNMENT");

  await assertResponsive(page, 1366, 768);
  await assertResponsive(page, 1920, 1080);
  await assertResponsive(page, 390, 844);
  await page.close();
}

async function runCreateAndDuplicate(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const state = await installBackendMocks(page, { patients: [patient("22222222-2222-4222-8222-222222222222", "PAC-002")] });
  await seedSession(page);
  await openNewAnalysis(page);
  await page.getByLabel("Nuevo paciente").check();
  const reference = page.getByLabel("Referencia de paciente");
  await reference.fill("pac-002");
  await page.getByRole("button", { name: "Crear paciente" }).click();
  await page.waitForSelector("text=Ya existe un paciente con esa referencia");
  await page.getByRole("button", { name: "Buscar paciente existente" }).click();
  await page.waitForSelector("text=PAC-002");
  assertTruthy(state.calls.create.length === 1, "el duplicado debe hacer un unico POST y no crear sufijos");

  await page.getByLabel("Nuevo paciente").check();
  await reference.fill("PAC-NEW-003");
  await page.getByRole("button", { name: "Crear paciente" }).click();
  await page.waitForSelector("text=PAC-NEW-003");
  assertTruthy(await page.locator("text=Paciente seleccionado").count() === 1, "el Patient creado debe quedar seleccionado");
  await page.getByRole("button", { name: "Cancelar" }).click();
  assertTruthy(state.calls.delete === 0, "cancelar despues de crear no debe intentar DELETE");
  await page.close();
}

async function runAssignmentConflict(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const state = await installBackendMocks(page, { assignmentConflict: true });
  await seedSession(page);
  await openNewAnalysis(page);
  await page.getByPlaceholder("PAC-00").fill("PAC");
  await page.waitForSelector("text=PAC-001");
  await page.getByRole("button", { name: "PAC-001" }).click();
  await page.getByPlaceholder("CASE-XXXX").fill(caseId);
  await page.locator("button", { hasText: "Cargar un archivo por plano" }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: "sagittal.dcm", mimeType: "application/dicom", buffer: Buffer.from("deidentified-e2e") });
  await page.waitForSelector("text=sagittal.dcm cargado");
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.waitForSelector("text=Este estudio fue asociado a otro paciente mientras se procesaba", { timeout: 10000 });
  assertTruthy(state.calls.association.length === 1, "el 409 no debe reintentar ni reasignar automaticamente");
  assertTruthy(state.calls.association[0].reason === "INITIAL_ASSIGNMENT", "el 409 no debe cambiar a CORRECTION");
  await page.close();
}

async function runAnalysisRetry(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const state = await installBackendMocks(page, { runFailures: 1 });
  await seedSession(page);
  await openNewAnalysis(page);
  await page.getByPlaceholder("PAC-00").fill("PAC");
  await page.waitForSelector("text=PAC-001");
  await page.getByRole("button", { name: "PAC-001" }).click();
  await page.getByPlaceholder("CASE-XXXX").fill(caseId);
  await page.locator("button", { hasText: "Cargar un archivo por plano" }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles({ name: "sagittal.dcm", mimeType: "application/dicom", buffer: Buffer.from("deidentified-e2e") });
  await page.waitForSelector("text=sagittal.dcm cargado");
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.waitForSelector("text=No se pudo ejecutar el análisis", { timeout: 10000 });
  assertTruthy(await page.locator("text=Paciente seleccionado").count() === 1, "el Patient debe persistir tras fallo de análisis");
  assertTruthy(state.calls.association.length === 0, "un análisis fallido no debe intentar asociación");
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.waitForSelector("text=Study asociado correctamente", { timeout: 10000 });
  assertTruthy(state.calls.run === 2, "retry debe ejecutar exactamente una nueva corrida");
  assertTruthy(state.calls.association.length === 1, "retry exitoso debe asociar una sola vez");
  assertTruthy(state.calls.create.length === 0, "retry de análisis no debe recrear Patient");
  await page.close();
}

async function run() {
  const server = serveDist();
  await once(server, "listening");
  const browser = await chromium.launch();
  try {
    await runExistingPatientAndAssociationRetry(browser);
    await runCreateAndDuplicate(browser);
    await runAnalysisRetry(browser);
    await runAssignmentConflict(browser);
    console.log("Playwright Patient PR3 E2E passed: existing, create/duplicate, analysis retry, association retry, 409, responsive.");
  } finally {
    await browser.close();
    server.close();
    await once(server, "close");
  }
}

await run();
