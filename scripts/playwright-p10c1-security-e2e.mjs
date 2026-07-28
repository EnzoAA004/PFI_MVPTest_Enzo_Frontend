import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

/**
 * P10-C.1 security/session/observability E2E. Deterministic, fully mocked
 * HTTP backend (page.route) — no real backend, no real AI Module, no
 * personal data. Every scenario below runs against a MOCKED backend, not
 * the real one; see docs/P10_FRONTEND_SECURITY_OBSERVABILITY.md for the
 * (optional, env-gated) real-backend smoke test.
 */

const port = 5201;
const appUrl = `http://127.0.0.1:${port}`;
const backendUrl = "http://localhost:8080";
const authKey = "lumbar-mri-auth-session-v1";
const caseId = "CASE-P10C1-E2E";

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

function validSession(overrides = {}) {
  return {
    accessToken: "e2e-token",
    refreshToken: "e2e-refresh",
    tokenType: "Bearer",
    user: { id: "prof-e2e", fullName: "Dra E2E", email: "e2e@example.test", licenseNumber: "MP-000", specialty: "Radiologia", institution: "Centro E2E", roles: ["DOCTOR"], verified: true, approved: true, onboardingCompleted: true },
    ...overrides,
  };
}

async function seedSession(page, session) {
  await page.addInitScript(({ authKey: key, session: seeded }) => {
    const request = indexedDB.open("lumbar-mri-analysis-storage", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(JSON.stringify(seeded), key);
      tx.oncomplete = () => db.close();
    };
  }, { authKey, session });
}

async function readAuthKeyFromIndexedDb(page) {
  return page.evaluate(({ authKey: key }) => new Promise((resolve) => {
    const request = indexedDB.open("lumbar-mri-analysis-storage", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("kv");
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("kv", "readonly");
      const getRequest = tx.objectStore("kv").get(key);
      getRequest.onsuccess = () => resolve(getRequest.result ?? null);
      tx.oncomplete = () => db.close();
    };
    request.onerror = () => resolve(null);
  }), { authKey });
}

function basicStudiesResponse() {
  return { status: "ok", source: "backend", items: [], summary: { totalStudies: 0 } };
}

function trackJsErrors(page) {
  const jsErrors = [];
  page.on("pageerror", (error) => jsErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") jsErrors.push(message.text());
  });
  return jsErrors;
}

async function newContext(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

async function run() {
  const server = serveDist();
  await once(server, "listening");
  const browser = await chromium.launch();
  let scenariosPassed = 0;

  try {
    // -----------------------------------------------------------------
    // E2E1 - sesion valida: flujo completo carga sin forzar logout.
    // -----------------------------------------------------------------
    {
      const { context, page } = await newContext(browser);
      await seedSession(page, validSession());
      const jsErrors = trackJsErrors(page);
      await page.route(`${backendUrl}/api/**`, (route) => {
        const apiPath = new URL(route.request().url()).pathname;
        if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
        if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
        if (apiPath === "/api/studies") return route.fulfill({ json: basicStudiesResponse() });
        return route.fulfill({ json: {} });
      });
      await page.goto(appUrl);
      await page.waitForSelector("text=Inicio", { timeout: 15000 });
      assertTruthy(!(await page.locator("text=Ingresar como profesional").count()), "una sesion valida no debe mostrar el login");
      const relevant = jsErrors.filter((message) => !message.includes("Failed to load resource") && !message.includes("favicon"));
      assertTruthy(relevant.length === 0, `E2E1 no debe generar errores JS: ${relevant.join(" | ")}`);
      await context.close();
      scenariosPassed += 1;
      console.log("E2E1 (sesion valida) passed.");
    }

    // -----------------------------------------------------------------
    // E2E2 - token vencido recuperable: 401 -> refresh -> reintento unico -> continua.
    // -----------------------------------------------------------------
    {
      const { context, page } = await newContext(browser);
      await seedSession(page, validSession());
      let refreshCalls = 0;
      let studiesCalls = 0;
      await page.route(`${backendUrl}/api/**`, (route) => {
        const apiPath = new URL(route.request().url()).pathname;
        if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
        if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
        if (apiPath === "/api/auth/refresh") {
          refreshCalls += 1;
          return route.fulfill({ json: { accessToken: "e2e-token-2", refreshToken: "e2e-refresh-2", tokenType: "Bearer", user: validSession().user } });
        }
        if (apiPath === "/api/studies") {
          studiesCalls += 1;
          if (studiesCalls === 1) return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
          return route.fulfill({ json: basicStudiesResponse() });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto(appUrl);
      await page.waitForSelector("text=Inicio", { timeout: 15000 });
      for (let attempt = 0; attempt < 50 && studiesCalls < 2; attempt += 1) await sleep(100);
      assertTruthy(!(await page.locator("text=Ingresar como profesional").count()), "un 401 recuperable no debe forzar logout");
      assertTruthy(refreshCalls === 1, `refresh debe llamarse exactamente una vez, se llamo ${refreshCalls}`);
      assertTruthy(studiesCalls === 2, `studies debe reintentarse exactamente una vez tras el refresh, se llamo ${studiesCalls}`);
      await context.close();
      scenariosPassed += 1;
      console.log("E2E2 (token vencido recuperable) passed.");
    }

    // -----------------------------------------------------------------
    // E2E3 - token revocado: refresh falla -> sesion limpiada -> login -> sin datos protegidos.
    // -----------------------------------------------------------------
    {
      const { context, page } = await newContext(browser);
      await seedSession(page, validSession());
      await page.route(`${backendUrl}/api/**`, (route) => {
        const apiPath = new URL(route.request().url()).pathname;
        if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
        if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
        if (apiPath === "/api/auth/refresh") return route.fulfill({ status: 401, json: { message: "Refresh token revoked" } });
        if (apiPath === "/api/studies") return route.fulfill({ status: 401, json: { message: "Unauthorized" } });
        return route.fulfill({ json: {} });
      });
      await page.goto(appUrl);
      await page.waitForSelector("text=Ingresar como profesional", { timeout: 15000 });
      assertTruthy(!(await page.locator("text=Inicio").count()), "una sesion revocada no debe dejar pantallas protegidas visibles");
      const storedSession = await readAuthKeyFromIndexedDb(page);
      assertTruthy(storedSession === null, "la sesion revocada debe limpiarse de IndexedDB");
      await context.close();
      scenariosPassed += 1;
      console.log("E2E3 (token revocado) passed.");
    }

    // -----------------------------------------------------------------
    // E2E4 - permiso insuficiente: 403 -> sesion activa -> accion bloqueada -> mensaje seguro.
    // -----------------------------------------------------------------
    {
      const { context, page } = await newContext(browser);
      await seedSession(page, validSession());
      let refreshCalls = 0;
      await page.route(`${backendUrl}/api/**`, (route) => {
        const apiPath = new URL(route.request().url()).pathname;
        if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
        if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
        if (apiPath === "/api/auth/refresh") {
          refreshCalls += 1;
          return route.fulfill({ json: { accessToken: "e2e-token-2", refreshToken: "e2e-refresh-2", tokenType: "Bearer", user: validSession().user } });
        }
        if (apiPath === "/api/studies") return route.fulfill({ status: 403, json: { message: "org.springframework.security.access.AccessDeniedException: Access is denied" } });
        return route.fulfill({ json: {} });
      });
      await page.goto(appUrl);
      await page.waitForSelector("text=Inicio", { timeout: 15000 });
      assertTruthy(!(await page.locator("text=Ingresar como profesional").count()), "un 403 nunca debe forzar logout: la sesion sigue activa");
      assertTruthy(refreshCalls === 0, "un 403 nunca debe disparar un refresh de sesion");
      await page.waitForSelector("text=Error al consultar estudios", { timeout: 15000 });
      const bodyText = await page.locator("body").innerText();
      assertTruthy(!bodyText.includes("AccessDeniedException"), "el nombre de la excepcion interna nunca debe llegar al DOM");
      assertTruthy(bodyText.includes("No tenés permiso") || bodyText.includes("permiso"), "el 403 debe mostrar un mensaje seguro de permiso insuficiente");
      await context.close();
      scenariosPassed += 1;
      console.log("E2E4 (permiso insuficiente) passed.");
    }

    // -----------------------------------------------------------------
    // E2E5 - URL externa maliciosa: un asset 3D con host externo en el contrato
    // nunca genera una solicitud de red hacia ese host, ni le adjunta Authorization.
    // -----------------------------------------------------------------
    {
      const { context, page } = await newContext(browser);
      await seedSession(page, validSession());
      let externalHostHit = false;
      await page.route("https://evil.example/**", (route) => {
        externalHostHit = true;
        return route.abort();
      });
      await page.route(`${backendUrl}/api/**`, (route) => {
        const apiPath = new URL(route.request().url()).pathname;
        if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
        if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
        if (apiPath === "/api/studies") {
          return route.fulfill({
            json: {
              status: "ok",
              source: "backend",
              items: [{ caseId, subjectRef: null, studyDate: null, modality: "MRI", description: null, status: "completed", planes: ["sagittal"], primaryPlane: "sagittal", latestRunId: "run-e2e5", runId: "run-e2e5", modelKey: "sagittal_spider", modelStatus: "completed", reviewStatus: "pendiente", priority: "media", dataOrigin: "database" }],
              summary: { totalStudies: 1 },
            },
          });
        }
        if (apiPath === `/api/studies/${caseId}`) {
          return route.fulfill({
            json: {
              status: "ok",
              study: { caseId, subjectRef: null, studyDate: null, modality: "MRI", description: null, status: "completed", planes: ["sagittal"], primaryPlane: "sagittal", latestRunId: "run-e2e5", runId: "run-e2e5", modelKey: "sagittal_spider", modelStatus: "completed", reviewStatus: "pendiente", priority: "media", dataOrigin: "database" },
              runs: [{
                runId: "run-e2e5", caseId, planes: ["sagittal"], primaryPlane: "sagittal", status: "completed", reviewStatus: "pendiente",
                sagittalRunId: "run-e2e5-sagittal", sagittalModelKey: "sagittal_spider", modelKey: "sagittal_spider", modelStatus: "completed",
                measurementsByPlane: { sagittal: [] },
                artifactsByPlane: {},
                corrections: [],
                // Malicious payload: an external host in the durable 3D asset URL.
                // isDurableMeshAssetUrl must discard it during parsing, before any
                // fetch is attempted and before Authorization is ever attached.
                canonicalRun: {
                  threeD: {
                    enabled: true,
                    status: "experimental_ready",
                    sourcePlaneRunIds: { sagittal: "run-e2e5-sagittal", axial: null },
                    requiredInputs: [],
                    assets: [{ assetName: "lumbar-3d-mesh.json", role: "mesh_3d", contentType: "application/json", generated: true, url: "https://evil.example/steal/lumbar-3d-mesh.json" }],
                    reconstruction: { kind: "experimental_geometric_proxy", method: "dual_plane_bbox_proxy", anatomicalReconstruction: false, volumetricReconstruction: false, coordinateSystem: "local_proxy_space", mappingSource: "config", mappingValidated: false },
                    warnings: [],
                  },
                },
              }],
              review: { runId: "run-e2e5", status: "pendiente" },
              auditTrail: [],
              humanReviewRequired: true,
              notClinicalDiagnosis: true,
              dataOrigin: "database",
            },
          });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto(appUrl);
      await page.waitForSelector("text=Inicio", { timeout: 15000 });
      await page.locator("text=Estudios").first().click().catch(() => undefined);
      await page.waitForSelector(`text=${caseId}`, { timeout: 15000 }).catch(() => undefined);
      // Give the app time to have attempted (and rejected) the malicious asset
      // if it were ever going to; the request must never actually occur.
      await sleep(1500);
      assertTruthy(!externalHostHit, "la app nunca debe emitir una solicitud de red hacia el host externo malicioso, ni siquiera para descartarla");
      await context.close();
      scenariosPassed += 1;
      console.log("E2E5 (URL externa maliciosa) passed.");
    }

    // -----------------------------------------------------------------
    // E2E6 - error interno saneado: el backend simula un stack trace/SQL/path
    // interno y la UI solo debe mostrar un mensaje seguro + traceId.
    // -----------------------------------------------------------------
    {
      const { context, page } = await newContext(browser);
      await seedSession(page, validSession());
      const leakedText = "org.postgresql.util.PSQLException: ERROR: syntax error at or near \"SELECT\" at java.base/jdk.internal.reflect.NativeConstructorAccessorImpl.newInstance0(Native Method) jdbc:postgresql://internal-db:5432/pfi C:\\app\\backend\\target\\classes";
      await page.route(`${backendUrl}/api/**`, (route) => {
        const apiPath = new URL(route.request().url()).pathname;
        if (apiPath === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
        if (apiPath === "/api/ai/models") return route.fulfill({ json: [] });
        if (apiPath === "/api/studies") return route.fulfill({ status: 500, json: { message: leakedText, traceId: "backend-trace-e2e6" } });
        return route.fulfill({ json: {} });
      });
      await page.goto(appUrl);
      await page.waitForSelector("text=Inicio", { timeout: 15000 });
      await page.waitForSelector("text=Error al consultar estudios", { timeout: 15000 });
      const bodyText = await page.locator("body").innerText();
      assertTruthy(!bodyText.includes("PSQLException"), "el stack trace del backend nunca debe llegar al DOM");
      assertTruthy(!bodyText.includes("jdbc:postgresql"), "la cadena de conexion nunca debe llegar al DOM");
      assertTruthy(!bodyText.includes("C:\\app\\backend"), "un path interno nunca debe llegar al DOM");
      assertTruthy(bodyText.includes("no está disponible temporalmente") || bodyText.includes("no esta disponible temporalmente"), "un 500 debe mostrar el mensaje generico saneado");
      await context.close();
      scenariosPassed += 1;
      console.log("E2E6 (error interno saneado) passed.");
    }

    assertTruthy(scenariosPassed === 6, `deben pasar los 6 escenarios, pasaron ${scenariosPassed}`);
    console.log("Playwright P10-C.1 security E2E passed (6/6 scenarios, mocked backend).");
  } finally {
    await browser.close();
    server.close();
    await Promise.race([once(server, "close"), sleep(1000)]);
  }
}

await run();
