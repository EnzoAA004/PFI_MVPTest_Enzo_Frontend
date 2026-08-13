import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const port = 5211;
const appUrl = `http://127.0.0.1:${port}`;
const backendUrl = "http://localhost:8080";
const authKey = "lumbar-mri-auth-session-v1";
const evidenceDir = process.env.UI_PR1_EVIDENCE_DIR;
const evidenceLabel = process.env.UI_PR1_EVIDENCE_LABEL ?? "after";

function assertTruthy(value, message) {
  if (!value) throw new Error(`UI-PR1 E2E: ${message}`);
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

const studies = [
  { caseId: "CASE-023", subjectRef: "PAC-014", studyDate: "2026-08-12", description: "RM lumbar de control", planes: ["sagittal", "axial"], latestRunId: "run-023", modelKey: "sagittal_spider", reviewStatus: "pendiente", priority: "alta" },
  { caseId: "CASE-021", subjectRef: "PAC-008", studyDate: "2026-08-11", description: "Columna lumbar", planes: ["sagittal"], latestRunId: "run-021", modelKey: "sagittal_spider", reviewStatus: "pendiente", priority: "media" },
  { caseId: "CASE-019", subjectRef: "PAC-011", studyDate: null, description: "RM lumbar", planes: ["axial"], latestRunId: "run-019", modelKey: "axial_unet", reviewStatus: "observado", priority: "alta" },
  { caseId: "CASE-018", subjectRef: "PAC-004", studyDate: "2026-08-02", description: "Seguimiento lumbar", planes: ["sagittal", "axial"], latestRunId: "run-018", modelKey: "sagittal_spider", reviewStatus: "pendiente", priority: "baja" },
  { caseId: "CASE-014", subjectRef: "PAC-003", studyDate: "2026-07-28", description: "RM lumbar", planes: ["sagittal"], latestRunId: "run-014", modelKey: "sagittal_spider", reviewStatus: "aceptado", priority: "media" },
  { caseId: "CASE-009", subjectRef: "PAC-001", studyDate: "2026-07-20", description: "Control postoperatorio", planes: ["sagittal", "axial"], latestRunId: "run-009", modelKey: "sagittal_spider", reviewStatus: "aceptado", priority: "baja" },
  { caseId: "CASE-006", subjectRef: null, studyDate: "2026-07-15", description: "Estudio legacy", planes: [], latestRunId: null, modelKey: null, reviewStatus: "pendiente", priority: "media" },
];

const user = {
  id: "professional-ui-pr1",
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
  }), { key: authKey, value: { accessToken: "ui-pr1-token", refreshToken: "ui-pr1-refresh", tokenType: "Bearer", user } });
  await page.reload();
}

async function installBackendMocks(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route(`${backendUrl}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/system/health") return route.fulfill({ json: { status: "ok" } });
    if (url.pathname === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
    if (url.pathname === "/api/ai/models") return route.fulfill({ json: [] });
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: user });
    if (url.pathname === "/api/studies") {
      return route.fulfill({ json: { status: "ok", source: "postgres-domain", dataOrigin: "database", items: studies, humanReviewRequired: true, notClinicalDiagnosis: true } });
    }
    if (url.pathname === "/api/studies/CASE-023") {
      return route.fulfill({ json: { study: studies[0], runs: [], auditTrail: [], humanReviewRequired: true, notClinicalDiagnosis: true, dataOrigin: "database" } });
    }
    if (url.pathname === "/api/audit" || url.pathname === "/api/audit/events") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });
  return errors;
}

async function capture(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assertTruthy(dimensions.scrollWidth <= dimensions.clientWidth, `${width}x${height} no debe tener overflow horizontal del documento`);
  if (width <= 700) {
    const mobileLayout = await page.locator(".wl-row").first().evaluate((element) => ({
      display: getComputedStyle(element).display,
      width: element.getBoundingClientRect().width,
    }));
    assertTruthy(mobileLayout.display === "grid", `${width}x${height} debe presentar Studies como cards`);
    assertTruthy(mobileLayout.width <= width - 16, `${width}x${height} debe mantener cada card dentro del viewport`);
  }
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `${evidenceLabel}-worklist-${width}x${height}.png`), fullPage: true });
  }
}

const server = serveDist();
await once(server, "listening");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = await installBackendMocks(page);
  await seedSession(page);
  await page.getByRole("heading", { name: "Lista de trabajo" }).waitFor({ timeout: 10_000 });
  assertTruthy(await page.getByText("CASE-023").count() === 1, "debe mostrar estudios persistidos");
  assertTruthy(await page.getByRole("button", { name: /Pendientes\s+4/ }).count() === 1, "debe presentar el contador operativo de pendientes");
  assertTruthy(await page.locator(".study-status-pendiente").count() === 4, "debe mostrar estado visible para cada estudio pendiente");

  await page.getByRole("button", { name: /Observados\s+1/ }).click();
  await page.getByText("CASE-019").waitFor();
  assertTruthy(await page.locator(".study-status-observado").count() === 1, "el filtro Observados debe conservar su semántica");

  await page.getByRole("button", { name: /Total\s+7/ }).click();
  const search = page.getByLabel("Buscar estudios");
  await search.fill("CASE-021");
  assertTruthy(await page.locator(".wl-row").count() === 1, "la búsqueda debe filtrar sin requests adicionales");
  await search.fill("NO-MATCH");
  await page.getByText("No hay estudios para esta búsqueda.").waitFor();
  await search.fill("");

  await page.getByRole("button", { name: /^Caso/ }).click();
  assertTruthy((await page.locator(".wl-row").first().innerText()).includes("CASE-006"), "sorting por caso debe seguir operativo");
  await page.getByRole("button", { name: /^Fecha/ }).click();
  await page.getByRole("button", { name: /Pendientes\s+4/ }).click();

  for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 768], [390, 844]]) await capture(page, width, height);
  await page.locator(".wl-row").first().press("Enter");
  await page.waitForURL(`${appUrl}/estudio/CASE-023`);
  await page.waitForTimeout(250);
  assertTruthy(errors.length === 0, `no debe emitir errores de runtime: ${errors.join(" | ")}`);
  await page.close();
  console.log("UI-PR1 E2E: PASS");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
