import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const port = 5198;
const appUrl = `http://127.0.0.1:${port}`;
const backendUrl = "http://localhost:8080";
const finalHash = "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944";
const authKey = "lumbar-mri-auth-session-v1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function serveDist() {
  const dist = path.resolve("dist");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", appUrl);
    const requestedPath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(dist, requestedPath === "/" ? "index.html" : requestedPath);
    const safePath = filePath.startsWith(dist) && fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(dist, "index.html");
    response.setHeader("Content-Type", contentType(safePath));
    fs.createReadStream(safePath).pipe(response);
  });
  server.listen(port, "127.0.0.1");
  return server;
}

function contractResponse() {
  return { status: "ready", readyForRealBaseline: true, planes: { sagittal: { readiness: "real_ready" }, axial: { readiness: "candidate_below_quality_gate" } } };
}

function planeRun(plane, mode = "real_baseline") {
  const runId = `${plane}-run-e2e`;
  return {
    runId,
    plane,
    inputId: `input-${plane}`,
    modelKey: plane === "sagittal" ? "sagittal_spider" : "axial_t2_alkafri",
    modelVersion: plane === "sagittal" ? "sagittal-spider-final-v1" : "axial-experimental-v1",
    artifactHash: plane === "sagittal" ? finalHash : "axial-experimental-artifact",
    effectiveInferenceMode: mode,
    inferenceMode: mode,
    requestedInferenceMode: "real_baseline",
    allowContractFallback: false,
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    degradedMode: false,
    status: mode === "real_baseline" ? "ok" : "candidate_below_quality_gate",
    aiOutput: {
      inferenceMode: mode,
      requestedInferenceMode: "real_baseline",
      realInferenceAvailable: mode === "real_baseline",
      humanReviewRequired: true,
      notClinicalDiagnosis: true,
    },
    metadata: plane === "sagittal" ? {
      inferenceMode: mode,
      selectedSlice: 8,
      selectedAxis: 2,
      sliceCount: 17,
      inputShapeNative: [17, 512, 512],
      inputShapeCanonical: [512, 512, 17],
      inputOrientationTransform: "move_axis_0_to_last",
      inPlaneSpacing: [0.8, 0.8],
      inPlaneSpacingUnit: "mm",
    } : { inferenceMode: mode, semanticStatus: "raw_semantics_pending" },
    measurements: { values: [{ id: `${plane}-canal`, label: `${plane} canal`, value: 12.4, unit: "mm" }] },
    assets: {
      "input.png": { runId, plane, assetName: "input.png", url: `/api/ai/assets/${runId}/${plane}/input.png` },
      "overlay.png": { runId, plane, assetName: "overlay.png", url: `/api/ai/assets/${runId}/${plane}/overlay.png` },
      "mask-preview.png": { runId, plane, assetName: "mask-preview.png", url: `/api/ai/assets/${runId}/${plane}/mask-preview.png` },
    },
  };
}

function runResponse(axialMode = "real_baseline") {
  const planes = { sagittal: planeRun("sagittal", "real_baseline") };
  if (axialMode !== "absent") planes.axial = planeRun("axial", axialMode);
  return {
    runId: `multi-run-${axialMode}`,
    effectiveInferenceMode: axialMode === "real_baseline" ? "real_baseline" : "mixed",
    requestedInferenceMode: "real_baseline",
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
    degradedMode: false,
    planes,
  };
}

async function seedSession(page) {
  await page.addInitScript(({ authKey: key }) => {
    const session = {
      accessToken: "e2e-token",
      refreshToken: "e2e-refresh",
      tokenType: "Bearer",
      user: {
        id: "prof-e2e",
        fullName: "Dra E2E",
        email: "e2e@example.test",
        licenseNumber: "MP-000",
        specialty: "Radiología",
        institution: "Centro E2E",
        roles: ["DOCTOR"],
        verified: true,
        approved: true,
        onboardingCompleted: true,
      },
    };
    const request = indexedDB.open("lumbar-mri-analysis-storage", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(JSON.stringify(session), key);
      tx.oncomplete = () => db.close();
    };
  }, { authKey });
}

async function installBackendMocks(page, axialMode) {
  let reviewPayload;
  await page.route(`${backendUrl}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;
    if (apiPath === "/api/ai/multiplanar/contract") return route.fulfill({ json: contractResponse() });
    if (apiPath === "/api/ai/inputs") {
      const plane = route.request().postData()?.includes("axial") ? "axial" : "sagittal";
      return route.fulfill({ json: { inputId: `input-${plane}`, caseId: "CASE-E2E", plane, format: "png", size: 123 } });
    }
    if (apiPath === "/api/ai/multiplanar/run") return route.fulfill({ json: runResponse(axialMode) });
    if (apiPath.endsWith("/review")) {
      reviewPayload = route.request().postDataJSON();
      return route.fulfill({ json: { reviewStatus: reviewPayload.reviewStatus, reviewer: reviewPayload.reviewer, comments: reviewPayload.comments, corrections: reviewPayload.corrections } });
    }
    if (apiPath.startsWith("/api/ai/assets/")) return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgo=", "base64") });
    if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
    if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
    if (apiPath === "/api/studies") return route.fulfill({ json: { status: "ok", items: [] } });
    if (apiPath === "/api/studies/demo-review") return route.fulfill({ json: null });
    if (apiPath === "/api/review/snapshot" || apiPath.includes("review")) return route.fulfill({ json: {} });
    return route.fulfill({ json: {} });
  });
  return () => reviewPayload;
}

async function openTimeline(page) {
  await page.goto(appUrl);
  await page.waitForSelector("text=Inicio", { timeout: 10000 });
  await page.locator("button", { hasText: /Nuevo/ }).first().click();
  await page.waitForSelector("text=Carga guiada de resonancia");
}

async function uploadScenarioInputs(page, includeAxial) {
  await page.locator('input[placeholder="CASE-XXXX"]').fill("CASE-E2E");
  const inputs = await page.locator('input[type="file"]').all();
  await inputs[0].setInputFiles({ name: "sagittal.png", mimeType: "image/png", buffer: Buffer.from("fake") });
  if (includeAxial) await inputs[1].setInputFiles({ name: "axial.png", mimeType: "image/png", buffer: Buffer.from("fake") });
  await page.waitForSelector("text=entrada real cargada");
}

async function runScenario(axialMode) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await seedSession(page);
  const getReviewPayload = await installBackendMocks(page, axialMode);
  await openTimeline(page);
  await uploadScenarioInputs(page, axialMode !== "absent");
  await page.locator("button", { hasText: "Continuar a procesamiento" }).click();
  await page.locator("button", { hasText: "Ejecutar análisis real" }).click();
  await page.waitForSelector("text=Evaluación técnica del runtime");
  if (axialMode !== "real_baseline") await page.waitForSelector("text=candidate_below_quality_gate");
  await page.waitForSelector("text=Provenance técnica de inferencia");
  await page.waitForSelector("text=cf11dcc0ad77...e944");
  const continueToEvaluation = page.locator("button", { hasText: "Continuar a evaluación" });
  if (await continueToEvaluation.count()) await continueToEvaluation.click();
  await page.waitForSelector("text=Mediciones devueltas por inferencia sagital real");
  await page.locator("button", { hasText: "Continuar a aprobar o editar" }).click();
  await page.locator("button", { hasText: "Guardar revisión" }).click();
  await page.waitForSelector("text=Revisión guardada");
  const payload = getReviewPayload();
  assertTruthy(payload?.corrections, "review uses corrections");
  assertTruthy(!("measurementCorrections" in payload), "review does not use measurementCorrections");
  await browser.close();
}

function assertTruthy(value, message) {
  if (!value) throw new Error(message);
}

const server = serveDist();
try {
  await once(server, "listening");
  await runScenario("real_baseline");
  await runScenario("contract");
  await runScenario("absent");
  console.log("Playwright contract E2E passed.");
} finally {
  server.close();
  await Promise.race([once(server, "close"), sleep(1000)]);
}
