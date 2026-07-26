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
const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

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
    status: plane === "sagittal" && mode === "real_baseline" ? null : "candidate_below_quality_gate",
    aiOutput: {
      status: mode === "real_baseline" ? "real_baseline_ready" : "candidate_below_quality_gate",
      inferenceMode: mode,
      requestedInferenceMode: "real_baseline",
      realInferenceAvailable: mode === "real_baseline",
      humanReviewRequired: true,
      notClinicalDiagnosis: true,
    },
    modelArtifact: plane === "sagittal" ? { baselineReady: true, availableForRealInference: true } : undefined,
    metadata: plane === "sagittal" ? {
      inferenceMode: mode,
      inputShapeNative: [352, 384, 17],
      inputShapeCanonical: [352, 384, 17],
      selectedAxis: 2,
      sliceCount: 17,
      selectedSlice: 7,
      inputOrientationTransform: "none",
      processedShape: [256, 256],
    } : { inferenceMode: mode, semanticStatus: "raw_semantics_pending" },
    measurements: plane === "sagittal"
      ? Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`measurement${index + 1}Mm`, 12 + index]))
      : { values: [{ id: `${plane}-canal`, label: `${plane} canal`, value: 12.4, unit: "mm" }] },
    assets: {
      "input.png": { runId, plane, assetName: "input.png", url: `/api/ai/assets/${runId}/${plane}/input.png` },
      "overlay.png": { runId, plane, assetName: "overlay.png", url: `/api/ai/assets/${runId}/${plane}/overlay.png` },
    },
    series: plane === "sagittal" ? [{
      id: "sag-series",
      name: "Sagital real E2E",
      plane,
      sliceCount: 17,
      selectedSlice: 7,
      assets: {
        "input.png": { runId, plane, assetName: "input.png", url: `/api/ai/assets/${runId}/${plane}/input.png` },
        "overlay.png": { runId, plane, assetName: "overlay.png", url: `/api/ai/assets/${runId}/${plane}/overlay.png` },
      },
      coordinateSpace: "model_256",
    }] : undefined,
    masks: plane === "sagittal" ? [
      { id: "mask-1", label: "Cuerpo vertebral", className: "vertebral_body" },
      { id: "mask-2", label: "Disco", className: "disc" },
      { id: "mask-3", label: "Canal espinal", className: "spinal_canal" },
    ] : undefined,
    landmarks: plane === "sagittal" ? [
      { id: "lm-1", label: "L3", seriesId: "sag-series", sliceIndex: 7, x: 90, y: 80, coordinateSpace: "model_256" },
      { id: "lm-2", label: "L4", seriesId: "sag-series", sliceIndex: 7, x: 120, y: 140, coordinateSpace: "model_256" },
      { id: "lm-3", label: "L5", seriesId: "sag-series", sliceIndex: 7, x: 130, y: 200, coordinateSpace: "model_256" },
    ] : undefined,
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
    threeD: axialMode === "absent" ? { status: "blocked_missing_axial" } : undefined,
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

async function installBackendMocks(page, axialMode, options = {}) {
  let reviewPayload;
  const assetRequests = [];
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
    if (apiPath.startsWith("/api/ai/assets/")) {
      const authorization = route.request().headers().authorization;
      assetRequests.push({ path: apiPath, authorization, url: route.request().url() });
      if (!authorization?.startsWith("Bearer ")) return route.fulfill({ status: 401, contentType: "application/json", json: { message: "Unauthorized" } });
      if (options.overlayFails && apiPath.endsWith("/overlay.png")) return route.fulfill({ status: 503, contentType: "application/json", json: { message: "overlay unavailable" } });
      return route.fulfill({ status: 200, contentType: "image/png", body: png1x1 });
    }
    if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
    if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
    if (apiPath === "/api/studies") return route.fulfill({ json: { status: "ok", items: [] } });
    if (apiPath === "/api/studies/demo-review") return route.fulfill({ json: null });
    if (apiPath === "/api/review/snapshot" || apiPath.includes("review")) return route.fulfill({ json: {} });
    return route.fulfill({ json: {} });
  });
  return { getReviewPayload: () => reviewPayload, assetRequests };
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

async function runScenario(axialMode, options = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await seedSession(page);
  const { getReviewPayload, assetRequests } = await installBackendMocks(page, axialMode, options);
  await openTimeline(page);
  await uploadScenarioInputs(page, axialMode !== "absent");
  await page.locator("button", { hasText: "Continuar a procesamiento" }).click();
  await page.locator("button", { hasText: "Ejecutar análisis real" }).click();
  await page.waitForSelector("text=Resultado sagital real_baseline");
  await page.waitForSelector("text=sagital_only");
  await page.waitForFunction(() => Array.from(document.querySelectorAll("dd")).some((element) => element.textContent?.includes("cf11dcc0ad77...e944") && element.getClientRects().length > 0));
  const continueToEvaluation = page.locator("button", { hasText: "Continuar a evaluación" });
  if (await continueToEvaluation.count()) await continueToEvaluation.click();
  await page.waitForSelector("text=Visor sagital real");
  await page.waitForSelector("text=Recurso real del backend");
  if (options.overlayFails) {
    await page.waitForSelector("text=overlay.png no disponible");
  } else {
    await page.waitForSelector("text=overlay.png disponible");
  }
  assertTruthy(assetRequests.some((request) => request.path.endsWith("/input.png") && request.authorization?.startsWith("Bearer ")), "input asset uses Bearer");
  assertTruthy(assetRequests.some((request) => request.path.endsWith("/overlay.png") && request.authorization?.startsWith("Bearer ")), "overlay asset uses Bearer");
  assertTruthy(assetRequests.every((request) => !request.url.includes("e2e-token") && !request.url.includes("Bearer")), "asset URLs do not include JWT");
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
  await runScenario("absent", { overlayFails: true });
  console.log("Playwright contract E2E passed.");
} finally {
  server.close();
  await Promise.race([once(server, "close"), sleep(1000)]);
}
