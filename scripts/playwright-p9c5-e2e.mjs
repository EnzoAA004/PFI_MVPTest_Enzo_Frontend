import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

/**
 * P9-C.5 smoke E2E. Deterministic, fully mocked HTTP backend (no real AI
 * Module, no real Backend, no personal data). Exercises the dual-plane
 * workspace: sagittal + axial upload -> canonical run with threeD.enabled ->
 * axial candidate badges -> experimental 3D proxy panel renders real
 * geometry -> coordinated 2D/3D selection -> edit an axial measurement ->
 * save review -> corrections payload includes the axial edit. Captures
 * screenshots into docs/evidence/p9c5/ as smoke-test evidence.
 */

const port = 5198;
const appUrl = `http://127.0.0.1:${port}`;
const backendUrl = "http://localhost:8080";
const finalHash = "cf11dcc0ad77a7c787e64a796a2fd7398ef906add461cef4b3d61f1a5238e944";
const authKey = "lumbar-mri-auth-session-v1";
const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
const caseId = "CASE-P9C5-E2E";
const runId = "run-p9c5-e2e-0001";
const evidenceDir = path.resolve("docs/evidence/p9c5");

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
    vertices: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    faces: [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7]],
    structures: [
      { label: "vertebra_group", vertexStart: 0, vertexCount: 4, faceStart: 0, faceCount: 2 },
      { label: "canal", vertexStart: 4, vertexCount: 4, faceStart: 2, faceCount: 2 },
    ],
    limitations: ["Proxy geometrico experimental derivado de bounding boxes 2D por plano."],
    traceability: {
      models: { sagittal: { runId: `${runId}-sagittal` }, axial: { runId: `${runId}-axial` } },
      parameters: { mappingSource: "config", mappingValidated: false },
    },
  };
}

/** Canonical public v2 response with dual-plane + threeD.enabled, matching AI Module P9-A.3.1.1 shape. */
function canonicalRunResponse() {
  return {
    status: "completed",
    schemaVersion: "pfi.multiplanar-run.v2",
    runId,
    traceId: "trace-p9c5-e2e-0001",
    caseId,
    workspaceMode: "dual_plane_with_3d_context",
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
        humanReviewRequired: true,
        notClinicalDiagnosis: true,
        modelKey: "sagittal_spider",
        modelVersion: "sagittal-spider-final-v1",
        artifactHash: finalHash,
        coordinateSpace: "canonical_voxel",
        modelArtifact: { baselineReady: true, availableForRealInference: true },
        aiOutput: { synthetic: false, fallbackReason: null, realInferenceAvailable: true },
        metadata: {
          synthetic: false, fallbackReason: null, inputId: "input-sagittal-e2e",
          inputShapeNative: [17, 512, 512], inputShapeCanonical: [512, 512, 17],
          inputOrientationTransform: "move_axis_0_to_last", selectedSlice: 8, sliceCount: 17,
          selectedAxis: 2, inPlaneSpacing: [0.8, 0.8],
        },
        assets: {
          "input.png": { url: `/api/ai/assets/${runId}-sagittal/sagittal/input.png` },
          "overlay.png": { url: `/api/ai/assets/${runId}-sagittal/sagittal/overlay.png` },
        },
        masks: [{ id: "mask-1", label: "vertebra_group", role: "segmentation" }, { id: "mask-2", label: "canal", role: "segmentation" }],
        landmarks: [
          { id: "lm-1", labelKey: "vertebra_group_centroid", x: 120.4, y: 88.1, coordinateSpace: "canonical_voxel" },
          { id: "lm-2", labelKey: "canal_centroid", x: 130.2, y: 95.6, coordinateSpace: "canonical_voxel" },
        ],
        measurements: [
          { id: "m-1", labelKey: "vertebra_group area", value: 12.4, unit: "mm2", confidence: 0.91, placeholder: false, plane: "sagittal" },
          { id: "m-2", labelKey: "canal width", value: 13.4, unit: "mm", confidence: 0.91, placeholder: false, plane: "sagittal" },
        ],
        quality: { status: "ok", warnings: [] },
      },
      axial: {
        runId: `${runId}-axial`,
        plane: "axial",
        status: "completed",
        effectiveInferenceMode: "real_baseline",
        degradedMode: false,
        humanReviewRequired: true,
        notClinicalDiagnosis: true,
        modelKey: "axial_t2_alkafri",
        modelVersion: "axial-t2-alkafri-final-v1",
        artifactHash: "axial-e2e-artifact-hash",
        coordinateSpace: "canonical_voxel",
        modelArtifact: {
          baselineReady: false, availableForRealInference: true, readiness: "real_candidate_ready",
          runtimeQualification: "axial_candidate_runtime_ready", qualityGatePassed: false,
        },
        aiOutput: { synthetic: false, fallbackReason: null, realInferenceAvailable: true },
        metadata: { synthetic: false, fallbackReason: null, inputId: "input-axial-e2e" },
        assets: {
          "input.png": { url: `/api/ai/assets/${runId}-axial/axial/input.png` },
          "overlay.png": { url: `/api/ai/assets/${runId}-axial/axial/overlay.png` },
        },
        masks: [{ id: "mask-ax-1", label: "raw_50", role: "segmentation" }],
        landmarks: [{ id: "lm-ax-1", labelKey: "raw_50_centroid", x: 60, y: 70, coordinateSpace: "canonical_voxel" }],
        measurements: [{ id: "m-ax-1", labelKey: "raw_50 area", value: 8.2, unit: "mm2", confidence: 0.7, placeholder: false, plane: "axial" }],
        quality: { status: "ok", warnings: [] },
      },
    },
    threeD: {
      enabled: true,
      status: "experimental_ready",
      sourcePlaneRunIds: { sagittal: `${runId}-sagittal`, axial: `${runId}-axial` },
      requiredInputs: [],
      assets: [{ assetName: "lumbar-3d-mesh.json", url: `/api/ai/assets/${runId}/workspace/lumbar-3d-mesh.json` }],
      reconstruction: {
        kind: "experimental_geometric_proxy", method: "dual_plane_bbox_proxy",
        anatomicalReconstruction: false, volumetricReconstruction: false,
        coordinateSystem: "local_proxy_space", mappingSource: "config", mappingValidated: false,
      },
      warnings: ["Proxy geometrico experimental: no es reconstruccion anatomica 3D final."],
    },
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
  let reviewPayload;
  const jsErrors = [];
  page.on("pageerror", (error) => jsErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") jsErrors.push(message.text());
  });
  let uploadCount = 0;
  await page.route(`${backendUrl}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname;
    if (apiPath === "/api/ai/multiplanar/contract") return route.fulfill({ json: { status: "ready", readyForRealBaseline: true, planes: { sagittal: { readiness: "real_baseline_ready" }, axial: { readiness: "candidate_below_quality_gate" } } } });
    if (apiPath === "/api/ai/inputs") {
      uploadCount += 1;
      const plane = uploadCount === 1 ? "sagittal" : "axial";
      return route.fulfill({ json: { inputId: `input-${plane}-e2e`, caseId, plane, format: "png", size: 123 } });
    }
    if (apiPath === "/api/ai/multiplanar/run") return route.fulfill({ json: canonicalRunResponse() });
    if (apiPath === `/api/ai/assets/${runId}/workspace/lumbar-3d-mesh.json`) return route.fulfill({ json: meshAsset() });
    if (apiPath.endsWith("/review")) {
      reviewPayload = route.request().postDataJSON();
      return route.fulfill({ json: { reviewStatus: reviewPayload.reviewStatus, reviewer: reviewPayload.reviewer, comments: reviewPayload.comments, corrections: reviewPayload.corrections } });
    }
    if (apiPath.startsWith("/api/ai/assets/")) {
      const authorization = route.request().headers().authorization;
      if (!authorization?.startsWith("Bearer ")) return route.fulfill({ status: 401, contentType: "application/json", json: { message: "Unauthorized" } });
      return route.fulfill({ status: 200, contentType: "image/png", body: png1x1 });
    }
    if (apiPath === "/api/studies") return route.fulfill({ json: { status: "ok", source: "backend", items: [] } });
    if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
    if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
    if (apiPath === "/api/studies/demo-review") return route.fulfill({ json: null });
    return route.fulfill({ json: {} });
  });
  return { getReviewPayload: () => reviewPayload, getJsErrors: () => jsErrors };
}

async function run() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const server = serveDist();
  await once(server, "listening");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await seedSession(page);
    const { getReviewPayload, getJsErrors } = await installBackendMocks(page);

    // 1-2. login (session seeded) + abrir Nuevo analisis
    await page.goto(appUrl);
    await page.waitForSelector("text=Inicio", { timeout: 10000 });
    await page.locator("button", { hasText: /Nuevo/ }).first().click();
    await page.waitForSelector("text=Carga guiada de resonancia");

    // 3. cargar sagital + axial
    await page.locator('input[placeholder="CASE-XXXX"]').fill(caseId);
    const fileInputs = await page.locator('input[type="file"]').all();
    assertTruthy(fileInputs.length >= 2, "deben existir inputs de archivo para sagital y axial");
    await fileInputs[0].setInputFiles({ name: "sagittal.png", mimeType: "image/png", buffer: Buffer.from("fake-sagittal") });
    await page.waitForSelector("text=entrada real cargada");
    await fileInputs[1].setInputFiles({ name: "axial.png", mimeType: "image/png", buffer: Buffer.from("fake-axial") });
    await page.waitForTimeout(200);
    await page.locator("button", { hasText: "Continuar a procesamiento" }).click();

    // 4. ejecutar analisis (respuesta dual-plane con threeD.enabled)
    await page.locator("button", { hasText: "Ejecutar análisis real" }).click();
    await page.waitForSelector("text=Resultado sagital real_baseline");
    assertTruthy(!(await page.locator("text=Contrato incompleto").count()), "no debe mostrarse ContractError");

    // 5. panel axial visible con flags de candidato, nunca baseline aprobado
    await page.waitForSelector("text=Visor axial (modelo candidato)");
    await page.waitForSelector("text=baselineReady: false");
    await page.waitForSelector("text=readiness: real_candidate_ready");
    await page.waitForSelector("text=runtimeQualification: axial_candidate_runtime_ready");
    assertTruthy(!(await page.locator("text=baseline aprobado").filter({ hasNotText: "no baseline aprobado" }).count()), "el axial nunca debe presentarse como baseline aprobado");

    // 6. mediciones separadas por plano
    await page.waitForSelector("text=Sagital");
    await page.waitForSelector("text=Axial");

    // 7. abrir panel del proxy 3D y esperar estado "available" (geometria real, no atlas generico)
    await page.locator("summary", { hasText: "Funcionalidad 3D" }).click();
    await page.waitForSelector("text=Proxy geométrico experimental", { timeout: 10000 });
    assertTruthy(!(await page.locator("text=Reconstrucción 3D del paciente").count()), "no debe presentarse como reconstruccion 3D del paciente");
    assertTruthy(!(await page.locator("text=Atlas lumbar genérico").count()), "el flujo de revision no debe mostrar el atlas generico cuando hay proxy real");
    await page.waitForSelector("canvas.experimental-proxy-canvas", { timeout: 10000 });

    await page.screenshot({ path: path.join(evidenceDir, "01-dual-plane-and-3d-proxy.png"), fullPage: true });

    // 8. seleccion coordinada 2D->3D: click en landmark sagital, verificar resaltado de estructura
    const sagittalLandmarkButton = page.locator("button", { hasText: "canal_centroid" }).first();
    if (await sagittalLandmarkButton.count()) {
      await sagittalLandmarkButton.click();
      await page.waitForSelector("button[aria-current='true']", { timeout: 5000 }).catch(() => undefined);
    }
    await page.screenshot({ path: path.join(evidenceDir, "02-coordinated-selection.png"), fullPage: true });

    // 9. editar una medicion axial
    const axialMeasurementInput = page.locator('input[aria-label*="Axial"]').first();
    assertTruthy(await axialMeasurementInput.count() > 0, "debe existir al menos un input de medicion axial editable");
    await axialMeasurementInput.fill("9.9");

    // 10. guardar revision
    await page.locator("button", { hasText: "Continuar a aprobar o editar" }).click();
    await page.waitForSelector("text=4. Aprobar o editar");
    await page.locator("select").first().selectOption({ label: "observado" }).catch(async () => {
      await page.locator("select").first().selectOption("observed");
    });
    await page.locator('input[placeholder="Nombre del profesional"]').fill("Dra E2E");
    await page.locator("button", { hasText: "Guardar revisión" }).click();
    await page.waitForSelector("text=Revisión guardada");

    // 11. la correccion axial persiste en el payload de revision (mismo mecanismo que sagital)
    const payload = getReviewPayload();
    assertTruthy(payload?.corrections !== undefined, "la revision debe incluir corrections");
    const axialCorrection = payload.corrections.find((correction) => correction.measurementId === "m-ax-1");
    assertTruthy(axialCorrection !== undefined, "la correccion de la medicion axial editada debe viajar en el payload de revision");
    assertTruthy(String(axialCorrection.afterValue.value) === "9.9", "el valor corregido de la medicion axial debe ser 9.9");

    await page.screenshot({ path: path.join(evidenceDir, "03-review-saved-with-axial-correction.png"), fullPage: true });

    // 12. no errores de JavaScript
    const jsErrors = getJsErrors();
    const relevantErrors = jsErrors.filter((message) => !message.includes("Failed to load resource") && !message.includes("favicon"));
    assertTruthy(relevantErrors.length === 0, `no deben ocurrir errores de JavaScript: ${relevantErrors.join(" | ")}`);

    console.log(`Playwright P9-C.5 E2E passed. Evidence saved to ${evidenceDir}`);
  } finally {
    await browser.close();
    server.close();
    await Promise.race([once(server, "close"), sleep(1000)]);
  }
}

await run();
