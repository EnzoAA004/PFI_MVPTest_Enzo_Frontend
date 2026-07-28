import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

/**
 * P9-C.5 Parte B smoke E2E: reopens a persisted dual-plane study straight from
 * the worklist (no "Nuevo analisis" / upload / AI Module run involved) and
 * verifies the experimental 3D proxy renders from the Backend's durable
 * canonicalRun contract. The AI Module inference route
 * (/api/ai/multiplanar/run) is intentionally left unmocked/tripwired — if the
 * app ever calls it during reopening, the test fails loudly.
 */

const port = 5197;
const appUrl = `http://127.0.0.1:${port}`;
const backendUrl = "http://localhost:8080";
const authKey = "lumbar-mri-auth-session-v1";
const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
const caseId = "CASE-P9C5B-REOPEN";
const runId = "run-p9c5b-reopen-0001";
const evidenceDir = path.resolve("docs/evidence/p9c5b");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertTruthy(value, message) {
  if (!value) throw new Error(`E2E assertion failed: ${message}`);
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

function meshAsset() {
  return {
    schemaVersion: "pfi.lumbar-geometric-proxy.v1",
    kind: "experimental_geometric_proxy",
    method: "dual_plane_bbox_proxy",
    anatomicalReconstruction: false,
    volumetricReconstruction: false,
    coordinateSystem: "local_proxy_space",
    units: "normalized",
    vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]],
    faces: [[0, 1, 2], [0, 2, 3]],
    structures: [{ label: "canal", vertexStart: 0, vertexCount: 4, faceStart: 0, faceCount: 2 }],
    limitations: ["Proxy geometrico experimental derivado de bounding boxes 2D por plano."],
    traceability: { models: { sagittal: { runId: `${runId}-sagittal` }, axial: { runId: `${runId}-axial` } }, parameters: { mappingSource: "config", mappingValidated: false } },
  };
}

function studyListResponse() {
  return {
    status: "ok",
    source: "backend",
    items: [
      {
        caseId, subjectRef: null, studyDate: null, modality: "MRI", description: null,
        status: "completed", planes: ["sagittal", "axial"], primaryPlane: "sagittal",
        latestRunId: runId, runId, modelKey: "sagittal_spider", modelStatus: "completed",
        reviewStatus: "aceptado", priority: "media", dataOrigin: "database",
      },
      ...maliciousStudyListResponse().items,
    ],
  };
}

const maliciousCaseId = "CASE-P9C5B-MALICIOUS-MESH";
const maliciousRunId = "run-p9c5b-malicious-0001";

function maliciousStudyListResponse() {
  return {
    status: "ok", source: "backend",
    items: [{
      caseId: maliciousCaseId, subjectRef: null, studyDate: null, modality: "MRI", description: null,
      status: "completed", planes: ["sagittal", "axial"], primaryPlane: "sagittal",
      latestRunId: maliciousRunId, runId: maliciousRunId, modelKey: "sagittal_spider", modelStatus: "completed",
      reviewStatus: "aceptado", priority: "media", dataOrigin: "database",
    }],
  };
}

function maliciousStudyDetailResponse() {
  const canonicalThreeD = {
    enabled: true,
    status: "experimental_ready",
    sourcePlaneRunIds: { sagittal: `${maliciousRunId}-sagittal`, axial: `${maliciousRunId}-axial` },
    requiredInputs: [],
    // A compromised/misconfigured upstream trying to point the mesh at an external host.
    assets: [{ assetName: "lumbar-3d-mesh.json", role: "mesh_3d", contentType: "application/json", generated: true, url: "http://evil-external-host.test/steal/lumbar-3d-mesh.json" }],
    reconstruction: { kind: "experimental_geometric_proxy", method: "dual_plane_bbox_proxy", anatomicalReconstruction: false, volumetricReconstruction: false, coordinateSystem: "local_proxy_space", mappingSource: "config", mappingValidated: false },
    warnings: [],
  };
  return {
    status: "ok",
    study: { caseId: maliciousCaseId, subjectRef: null, studyDate: null, modality: "MRI", description: null, status: "completed", planes: ["sagittal", "axial"], primaryPlane: "sagittal", latestRunId: maliciousRunId, runId: maliciousRunId, modelKey: "sagittal_spider", modelStatus: "completed", reviewStatus: "aceptado", priority: "media", dataOrigin: "database" },
    inputs: [],
    runs: [{
      runId: maliciousRunId, caseId: maliciousCaseId, planes: ["sagittal", "axial"], primaryPlane: "sagittal", status: "completed",
      reviewStatus: "aceptado", reviewer: "Dra E2E", reviewedAt: new Date().toISOString(), comments: "Revisado",
      sagittalRunId: `${maliciousRunId}-sagittal`, sagittalModelKey: "sagittal_spider", sagittalArtifactHash: "sha256:sag",
      axialRunId: `${maliciousRunId}-axial`, axialModelKey: "axial_t2_alkafri", axialArtifactHash: "sha256:ax",
      modelKey: "sagittal_spider", modelStatus: "completed",
      measurementsByPlane: { sagittal: [], axial: [] },
      artifactsByPlane: { sagittal: [], axial: [] },
      corrections: [],
      canonicalRun: {
        schemaVersion: "pfi.backend-run-snapshot.v2", runId: maliciousRunId, traceId: "trace-p9c5b-malicious", caseId: maliciousCaseId,
        workspaceMode: "dual_plane_with_3d_context", requestedInferenceMode: "real_baseline", effectiveInferenceMode: "real_baseline",
        status: "completed", requestedPlanes: ["sagittal", "axial"], completedPlanes: ["sagittal", "axial"],
        readiness: {}, planes: {}, threeD: canonicalThreeD, quality: {},
        review: { status: "aceptado", reviewer: "Dra E2E", reviewedAt: new Date().toISOString(), comments: "Revisado" },
        governance: { humanReviewRequired: true, notClinicalDiagnosis: true },
        humanReviewRequired: true, notClinicalDiagnosis: true, synthetic: false, fallbackReason: null,
      },
    }],
    auditTrail: [],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
  };
}

function studyDetailResponse() {
  const canonicalThreeD = {
    enabled: true,
    status: "experimental_ready",
    sourcePlaneRunIds: { sagittal: `${runId}-sagittal`, axial: `${runId}-axial` },
    requiredInputs: [],
    assets: [{ assetName: "lumbar-3d-mesh.json", role: "mesh_3d", contentType: "application/json", generated: true, url: `/api/ai/assets/${runId}/workspace/lumbar-3d-mesh.json` }],
    reconstruction: { kind: "experimental_geometric_proxy", method: "dual_plane_bbox_proxy", anatomicalReconstruction: false, volumetricReconstruction: false, coordinateSystem: "local_proxy_space", mappingSource: "config", mappingValidated: false },
    warnings: ["Proxy geometrico experimental: no es reconstruccion anatomica 3D final."],
  };
  return {
    status: "ok",
    study: { caseId, subjectRef: null, studyDate: null, modality: "MRI", description: null, status: "completed", planes: ["sagittal", "axial"], primaryPlane: "sagittal", latestRunId: runId, runId, modelKey: "sagittal_spider", modelStatus: "completed", reviewStatus: "aceptado", priority: "media", dataOrigin: "database" },
    inputs: [],
    runs: [{
      runId, caseId, planes: ["sagittal", "axial"], primaryPlane: "sagittal", status: "completed",
      reviewStatus: "aceptado", reviewer: "Dra E2E", reviewedAt: new Date().toISOString(), comments: "Revisado",
      sagittalRunId: `${runId}-sagittal`, sagittalModelKey: "sagittal_spider", sagittalArtifactHash: "sha256:sag",
      axialRunId: `${runId}-axial`, axialModelKey: "axial_t2_alkafri", axialArtifactHash: "sha256:ax",
      modelKey: "sagittal_spider", modelStatus: "completed",
      measurementsByPlane: {
        sagittal: [{ id: "m-1", label: "canal width", value: 13.4, aiValue: 13.4, reviewerValue: null, unit: "mm", plane: "sagittal", source: "AI", status: "pendiente" }],
        axial: [{ id: "m-ax-1", label: "raw_50 area", value: 8.2, aiValue: 8.2, reviewerValue: null, unit: "mm2", plane: "axial", source: "AI", status: "pendiente" }],
      },
      artifactsByPlane: {
        sagittal: [{ plane: "sagittal", runId: `${runId}-sagittal`, assetName: "overlay.png", proxyUrl: `/api/ai/assets/${runId}-sagittal/sagittal/overlay.png`, storageStatus: "stored", available: true }],
        axial: [{ plane: "axial", runId: `${runId}-axial`, assetName: "mask-preview.png", proxyUrl: `/api/ai/assets/${runId}-axial/axial/mask-preview.png`, storageStatus: "stored", available: true }],
      },
      corrections: [],
      canonicalRun: {
        schemaVersion: "pfi.backend-run-snapshot.v2", runId, traceId: "trace-p9c5b-reopen", caseId,
        workspaceMode: "dual_plane_with_3d_context", requestedInferenceMode: "real_baseline", effectiveInferenceMode: "real_baseline",
        status: "completed", requestedPlanes: ["sagittal", "axial"], completedPlanes: ["sagittal", "axial"],
        readiness: {}, planes: {}, threeD: canonicalThreeD, quality: {},
        review: { status: "aceptado", reviewer: "Dra E2E", reviewedAt: new Date().toISOString(), comments: "Revisado" },
        governance: { humanReviewRequired: true, notClinicalDiagnosis: true },
        humanReviewRequired: true, notClinicalDiagnosis: true, synthetic: false, fallbackReason: null,
      },
    }],
    auditTrail: [],
    humanReviewRequired: true,
    notClinicalDiagnosis: true,
  };
}

async function seedSession(page) {
  await page.addInitScript(({ authKey: key }) => {
    const session = {
      accessToken: "e2e-token", refreshToken: "e2e-refresh", tokenType: "Bearer",
      user: { id: "prof-e2e", fullName: "Dra E2E", email: "e2e@example.test", licenseNumber: "MP-000", specialty: "Radiología", institution: "Centro E2E", roles: ["DOCTOR"], verified: true, approved: true, onboardingCompleted: true },
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

async function installBackendMocks(page) {
  const jsErrors = [];
  const aiModuleRunCalls = [];
  const externalHostCalls = [];
  page.on("pageerror", (error) => jsErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") jsErrors.push(message.text());
  });
  await page.route(`${backendUrl}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;
    // Tripwire: this reopening flow must never trigger a new AI Module run.
    if (apiPath === "/api/ai/multiplanar/run") {
      aiModuleRunCalls.push(apiPath);
      return route.fulfill({ status: 500, json: { message: "AI Module must not be called during reopening" } });
    }
    if (apiPath === "/api/studies") return route.fulfill({ json: studyListResponse() });
    if (apiPath === `/api/studies/${caseId}`) return route.fulfill({ json: studyDetailResponse() });
    if (apiPath === `/api/studies/${maliciousCaseId}`) return route.fulfill({ json: maliciousStudyDetailResponse() });
    if (apiPath === `/api/ai/assets/${runId}/workspace/lumbar-3d-mesh.json`) {
      const authorization = route.request().headers().authorization;
      if (!authorization?.startsWith("Bearer ")) return route.fulfill({ status: 401, contentType: "application/json", json: { message: "Unauthorized" } });
      return route.fulfill({ status: 200, contentType: "application/json", json: meshAsset() });
    }
    if (apiPath.startsWith("/api/ai/assets/")) {
      const authorization = route.request().headers().authorization;
      if (!authorization?.startsWith("Bearer ")) return route.fulfill({ status: 401, contentType: "application/json", json: { message: "Unauthorized" } });
      return route.fulfill({ status: 200, contentType: "image/png", body: png1x1 });
    }
    if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
    if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
    if (apiPath === "/api/studies/demo-review") return route.fulfill({ json: null });
    return route.fulfill({ json: {} });
  });
  // Tripwire: catches the frontend ever attempting to reach the malicious
  // external host at all — the strict origin check in isDurableMeshAssetUrl /
  // fetchThreeDProxyAsset should refuse before any request is dispatched, so
  // this route should never fire. If it does, we also record whether a JWT
  // leaked into the request.
  await page.route("http://evil-external-host.test/**", async (route) => {
    externalHostCalls.push({ url: route.request().url(), authorization: route.request().headers().authorization ?? null });
    return route.fulfill({ status: 200, contentType: "application/json", json: meshAsset() });
  });
  return { getJsErrors: () => jsErrors, getAiModuleRunCalls: () => aiModuleRunCalls, getExternalHostCalls: () => externalHostCalls };
}

async function run() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const server = serveDist();
  await once(server, "listening");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedSession(page);
    const { getJsErrors, getAiModuleRunCalls, getExternalHostCalls } = await installBackendMocks(page);

    await page.goto(appUrl);
    await page.waitForSelector("text=Inicio", { timeout: 10000 });

    // 0. ir a Estudios (lista persistida, sin correr nada)
    await page.locator("button, a", { hasText: "Estudios" }).first().click();
    await page.waitForSelector(`button.case-link:has-text("${caseId}")`, { timeout: 10000 });

    // 0b. CASO MALICIOSO: un canonicalRun cuyo mesh apunta a un host externo debe
    // rechazarse sin enviar el JWT del profesional a ese host.
    await page.locator("button.case-link", { hasText: maliciousCaseId }).click();
    await page.waitForSelector("text=Espacio de revisión", { timeout: 10000 });
    await page.locator("button", { hasText: "Proxy 3D experimental" }).click();
    await page.waitForSelector("text=Proxy no disponible", { timeout: 10000 });
    assertTruthy(!(await page.locator("canvas.experimental-proxy-canvas").count()), "un mesh de host externo nunca debe llegar a renderizarse");
    assertTruthy(getExternalHostCalls().length === 0, "el frontend nunca debe llegar a solicitar el mesh a un host externo, ni siquiera sin JWT");

    await page.screenshot({ path: path.join(evidenceDir, "00-malicious-external-mesh-rejected.png"), fullPage: true });

    // 1. volver a Estudios para reabrir el caso legitimo
    await page.locator("button, a", { hasText: "Estudios" }).first().click();
    await page.waitForSelector(`button.case-link:has-text("${caseId}")`, { timeout: 10000 });

    // 2. abrir la revision directamente desde el worklist (reapertura pura)
    await page.locator("button.case-link", { hasText: caseId }).click();
    await page.waitForSelector("text=Espacio de revisión", { timeout: 10000 });
    assertTruthy(!(await page.locator("text=Contrato incompleto").count()), "no debe mostrarse ContractError al reabrir");

    // 3. ambos planos persistidos visibles
    await page.waitForSelector("text=Proxy 3D experimental");

    // 4. abrir el tab 3D y verificar el proxy real (no atlas generico)
    await page.locator("button", { hasText: "Proxy 3D experimental" }).click();
    await page.waitForSelector("text=Proxy geométrico experimental", { timeout: 10000 });
    assertTruthy(!(await page.locator("text=Atlas lumbar genérico").count()), "la reapertura no debe caer al atlas generico teniendo un proxy real");
    assertTruthy(!(await page.locator("text=Reconstrucción 3D del paciente").count()), "nunca debe presentarse como reconstruccion del paciente");
    await page.waitForSelector("canvas.experimental-proxy-canvas", { timeout: 10000 });

    await page.screenshot({ path: path.join(evidenceDir, "01-reopened-study-3d-proxy.png"), fullPage: true });

    // 5. ninguna llamada al AI Module durante toda la reapertura
    assertTruthy(getAiModuleRunCalls().length === 0, "la reapertura no debe llamar a /api/ai/multiplanar/run en ningun momento");

    // 6. sin errores de JS
    const jsErrors = getJsErrors();
    const relevantErrors = jsErrors.filter((message) => !message.includes("Failed to load resource") && !message.includes("favicon"));
    assertTruthy(relevantErrors.length === 0, `no deben ocurrir errores de JavaScript: ${relevantErrors.join(" | ")}`);

    console.log(`Playwright P9-C.5 Parte B reopening E2E passed. Evidence saved to ${evidenceDir}`);
  } finally {
    await browser.close();
    server.close();
    await Promise.race([once(server, "close"), sleep(1000)]);
  }
}

await run();
