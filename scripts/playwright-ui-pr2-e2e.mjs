import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const port = 5212;
const appUrl = `http://127.0.0.1:${port}`;
const backendUrl = "http://localhost:8080";
const authKey = "lumbar-mri-auth-session-v1";
const caseId = "CASE-UI-PR2";
const patientId = "11111111-1111-4111-8111-111111111111";
const runId = "run-ui-pr2";
const finalHash = "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944";
const evidenceDir = process.env.UI_PR2_EVIDENCE_DIR;

function assertTruthy(value, message) {
  if (!value) throw new Error(`UI-PR2 E2E: ${message}`);
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

const user = {
  id: "professional-ui-pr2",
  fullName: "Profesional QA",
  email: "qa@example.test",
  licenseNumber: "MP-QA",
  specialty: "Radiología",
  institution: "QA",
  roles: ["DOCTOR"],
  verified: true,
  approved: true,
  onboardingCompleted: true,
};

const study = {
  caseId,
  subjectRef: null,
  studyDate: "2026-08-13",
  description: "RM lumbar QA",
  planes: ["sagittal"],
  primaryPlane: "sagittal",
  latestRunId: runId,
  runId,
  modelKey: "sagittal_spider",
  modelStatus: "completed",
  reviewStatus: "pendiente",
  priority: "media",
  dataOrigin: "database",
};

function canonicalRunResponse() {
  const labels = [
    "vertebra_group area", "vertebra_group width", "vertebra_group height",
    "canal area", "canal width", "canal height",
    "disc_group area", "disc_group width", "disc_group height",
  ];
  return {
    status: "completed",
    schemaVersion: "pfi.multiplanar-run.v2",
    runId,
    traceId: "trace-ui-pr2",
    caseId,
    workspaceMode: "sagittal_only",
    requestedInferenceMode: "real_baseline",
    effectiveInferenceMode: "real_baseline",
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    degradedMode: false,
    synthetic: false,
    fallbackReason: null,
    planes: {
      sagittal: {
        runId: `${runId}-sagittal`,
        plane: "sagittal",
        status: "completed",
        effectiveInferenceMode: "real_baseline",
        degradedMode: false,
        synthetic: false,
        fallbackReason: null,
        allowContractFallback: false,
        humanReviewRequired: true,
        notClinicalDiagnosis: true,
        modelKey: "sagittal_spider",
        modelVersion: "sagittal-spider-final-v1",
        artifactHash: finalHash,
        coordinateSpace: "canonical_voxel",
        modelArtifact: {
          baselineReady: true,
          availableForRealInference: true,
          manifestValid: true,
        },
        aiOutput: { synthetic: false, fallbackReason: null, realInferenceAvailable: true },
        metadata: {
          synthetic: false,
          fallbackReason: null,
          inputId: "input-sagittal-ui-pr2",
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
      transaction.oncomplete = () => { database.close(); resolve(undefined); };
    };
  }), {
    key: authKey,
    value: { accessToken: "ui-pr2-token", refreshToken: "ui-pr2-refresh", tokenType: "Bearer", user },
  });
  await page.reload();
}

async function installBackendMocks(page, { failRun = false } = {}) {
  const calls = { run: 0, association: 0 };
  let studyCreated = false;
  await page.route(`${backendUrl}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    if (apiPath === "/api/system/health" || apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
    if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
    if (apiPath === "/api/auth/me") return route.fulfill({ json: user });
    if (apiPath === "/api/patients" && request.method() === "GET") {
      return route.fulfill({ json: [{ id: patientId, patientReference: "PAC-UI-PR2", createdAt: "2026-08-13T12:00:00Z", updatedAt: "2026-08-13T12:00:00Z" }] });
    }
    if (apiPath === "/api/studies") {
      return route.fulfill({
        json: {
          status: "ok",
          source: "postgres-domain",
          dataOrigin: "database",
          items: studyCreated ? [study] : [],
          humanReviewRequired: true,
          notClinicalDiagnosis: true,
        },
      });
    }
    if (apiPath === `/api/studies/${caseId}`) {
      return route.fulfill({ json: { study, runs: [canonicalRunResponse()], auditTrail: [], dataOrigin: "database", humanReviewRequired: true, notClinicalDiagnosis: true } });
    }
    if (apiPath === "/api/ai/inputs" && request.method() === "POST") {
      return route.fulfill({ json: { inputId: "input-sagittal-ui-pr2", caseId, plane: "sagittal", format: "dicom", size: 128 } });
    }
    if (apiPath === "/api/ai/multiplanar/run" && request.method() === "POST") {
      calls.run += 1;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (failRun) return route.fulfill({ status: 500, json: { code: "AI_UNAVAILABLE", message: "Internal", traceId: "trace-ui-pr2-error" } });
      studyCreated = true;
      return route.fulfill({ json: canonicalRunResponse() });
    }
    if (apiPath === `/api/studies/${caseId}/patient` && request.method() === "PUT") {
      calls.association += 1;
      return route.fulfill({ json: { studyId: "22222222-2222-4222-8222-222222222222", caseId, patientId, previousPatientId: null, reasonCode: "INITIAL_ASSIGNMENT", changed: true } });
    }
    if (apiPath === "/api/audit" || apiPath === "/api/audit/events") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  return calls;
}

async function openPreparedDrawer(page) {
  await page.getByRole("heading", { name: "Lista de trabajo" }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /Nuevo análisis/ }).click();
  await page.getByPlaceholder("PAC-00").fill("PAC");
  await page.getByRole("button", { name: "PAC-UI-PR2" }).click();
  await page.getByPlaceholder("CASE-XXXX").fill(caseId);
  await page.getByRole("button", { name: /Cargar un archivo por plano/ }).click();
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: "sagittal.dcm",
    mimeType: "application/dicom",
    buffer: Buffer.from("deidentified-ui-pr2"),
  });
  await page.getByText("sagittal.dcm cargado.").waitFor();
}

async function capture(page, name, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(100);
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assertTruthy(dimensions.scrollWidth <= dimensions.clientWidth, `${width}x${height} no debe tener overflow horizontal`);
  const drawer = page.locator(".wl-drawer");
  if (await drawer.count()) {
    const box = await drawer.boundingBox();
    assertTruthy(Boolean(box && box.width <= width && box.x + box.width <= width + 1), `${width}x${height} debe mantener el drawer dentro del viewport`);
  }
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `${name}-${width}x${height}.png`), fullPage: true });
  }
}

async function runSuccess(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const calls = await installBackendMocks(page);
  await seedSession(page);
  assertTruthy(await page.getByRole("columnheader", { name: "Modelo" }).count() === 0, "Worklist no debe mostrar Modelo");
  await openPreparedDrawer(page);
  assertTruthy(await page.getByText("Referencia interna del estudio (opcional)").count() === 1, "debe mostrar el copy operativo");
  assertTruthy(await page.getByPlaceholder("EST-2026-001").count() === 1, "debe mostrar el placeholder operativo");
  for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844]]) await capture(page, "new-analysis", width, height);

  const analyze = page.getByRole("button", { name: "Analizar" });
  await analyze.click();
  await page.getByRole("status", { name: "Progreso del análisis" }).waitFor();
  assertTruthy(await page.getByText("Procesando imágenes").first().isVisible(), "debe mostrar progreso visible");
  assertTruthy(await page.getByRole("button", { name: /Procesando/ }).isDisabled(), "Analizar debe quedar bloqueado durante el proceso");
  for (const [width, height] of [[1920, 1080], [1366, 768], [390, 844]]) await capture(page, "analysis-progress", width, height);
  await page.waitForTimeout(100);
  assertTruthy(calls.run === 1, "doble submit debe quedar bloqueado en una sola corrida");
  await page.waitForURL(`${appUrl}/estudio/${caseId}`, { timeout: 10_000 });
  assertTruthy(calls.run === 1 && calls.association === 1, "el éxito debe ejecutar una corrida y una asociación");
  await page.close();
}

async function runError(browser) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const calls = await installBackendMocks(page, { failRun: true });
  await seedSession(page);
  await openPreparedDrawer(page);
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.getByText(/No se pudo ejecutar el análisis/).waitFor({ timeout: 10_000 });
  assertTruthy(!new URL(page.url()).pathname.startsWith("/estudio/"), "un error no debe navegar a Study Review");
  assertTruthy(await page.locator(".wl-drawer").isVisible(), "un error debe mantener abierto el flujo de creación");
  assertTruthy(await page.getByText("Paciente seleccionado").count() === 1, "el Patient debe mantenerse seleccionado");
  assertTruthy(await page.getByRole("button", { name: "Analizar" }).isEnabled(), "el análisis debe poder reintentarse");
  assertTruthy(calls.run === 1 && calls.association === 0, "un fallo no debe asociar ni navegar");
  await page.close();
}

const server = serveDist();
await once(server, "listening");
const browser = await chromium.launch({ headless: true });
try {
  await runSuccess(browser);
  await runError(browser);
  console.log("UI-PR2 E2E: PASS — loading, submit lock, auto-navigation, error context and responsive.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
