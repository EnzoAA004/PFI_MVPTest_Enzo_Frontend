import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const port = 5204;
const appUrl = `http://127.0.0.1:${port}`;
const backendUrl = "http://localhost:8080";
const authKey = "lumbar-mri-auth-session-v1";
const evidenceDir = process.env.PATIENT_PR4_EVIDENCE_DIR;
const zeroId = "11111111-1111-4111-8111-111111111111";
const multipleId = "22222222-2222-4222-8222-222222222222";

function assertTruthy(value, message) {
  if (!value) throw new Error(`Patient PR4 E2E: ${message}`);
}

function serveDist() {
  const dist = path.resolve("dist");
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", appUrl);
    const candidate = path.join(dist, decodeURIComponent(url.pathname) === "/" ? "index.html" : decodeURIComponent(url.pathname));
    const filePath = candidate.startsWith(dist) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(dist, "index.html");
    response.setHeader("Content-Type", filePath.endsWith(".js") ? "text/javascript" : filePath.endsWith(".css") ? "text/css" : "text/html");
    fs.createReadStream(filePath).pipe(response);
  });
  server.listen(port, "127.0.0.1");
  return server;
}

function patient(id, patientReference) {
  return { id, patientReference, createdAt: "2026-08-12T10:00:00Z", updatedAt: "2026-08-12T10:00:00Z" };
}

const patients = [patient(zeroId, "PAC-ZERO"), patient(multipleId, "PAC-MULTI")];
const studiesByPatient = {
  [zeroId]: [],
  [multipleId]: [
    { id: "33333333-3333-4333-8333-333333333333", caseId: "CASE-NEW", studyDate: "2026-08-12", modality: "MRI", description: "Control", reviewPriority: "high", status: "completed" },
    { id: "44444444-4444-4444-8444-444444444444", caseId: "CASE-OLD", studyDate: "2025-03-03", modality: "MRI", description: "Inicial", reviewPriority: "medium", status: "created" },
  ],
};

async function seedSession(page) {
  const session = {
    accessToken: "patient-pr4-token",
    refreshToken: "patient-pr4-refresh",
    tokenType: "Bearer",
    user: {
      id: "professional-patient-pr4",
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
      transaction.oncomplete = () => { database.close(); resolve(undefined); };
    };
  }), { key: authKey, value: session });
  await page.reload();
}

async function installBackendMocks(page) {
  const requests = [];
  await page.route(`${backendUrl}/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push(url.pathname + url.search);
    if (url.pathname === "/api/system/health" || url.pathname === "/api/ai/health") return route.fulfill({ json: { status: "ok" } });
    if (url.pathname === "/api/ai/models") return route.fulfill({ json: [] });
    if (url.pathname === "/api/studies") {
      return route.fulfill({ json: { status: "ok", source: "postgres-domain", dataOrigin: "database", items: [], summary: { total: 0, pending: 0, completed: 0, flagged: 0 }, humanReviewRequired: true, notClinicalDiagnosis: true } });
    }
    if (url.pathname === "/api/patients") {
      const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
      return route.fulfill({ json: patients.filter((entry) => entry.patientReference.toLowerCase().startsWith(query)) });
    }
    const studiesMatch = url.pathname.match(/^\/api\/patients\/([^/]+)\/studies$/);
    if (studiesMatch) return route.fulfill({ json: studiesByPatient[studiesMatch[1]] ?? [] });
    const patientMatch = url.pathname.match(/^\/api\/patients\/([^/]+)$/);
    if (patientMatch) {
      const found = patients.find((entry) => entry.id === patientMatch[1]);
      return found ? route.fulfill({ json: found }) : route.fulfill({ status: 404, json: { code: "PATIENT_NOT_FOUND", message: "Not found" } });
    }
    if (url.pathname.startsWith("/api/studies/")) return route.fulfill({ status: 404, json: { code: "STUDY_NOT_FOUND", message: "Not found" } });
    return route.fulfill({ json: {} });
  });
  return requests;
}

async function assertResponsive(page, width, height, label) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(50);
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  assertTruthy(dimensions.scrollWidth <= dimensions.clientWidth, `${label} no debe tener overflow horizontal en ${width}x${height}`);
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `patient-pr4-${label}-${width}x${height}.png`), fullPage: true });
  }
}

const server = serveDist();
await once(server, "listening");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const requests = await installBackendMocks(page);
  await seedSession(page);

  await page.goto(`${appUrl}/pacientes`);
  await page.getByRole("heading", { name: "Pacientes registrados" }).waitFor();
  await page.getByText("PAC-ZERO", { exact: true }).waitFor();
  await page.getByText("PAC-MULTI", { exact: true }).waitFor();
  assertTruthy(!(await page.locator("body").innerText()).includes(zeroId), "UUID no debe ser nombre visible");
  assertTruthy(requests.filter((url) => /^\/api\/patients\/[^/]+\/studies/.test(url)).length === 0, "la lista no debe hacer N+1 de Studies");

  const search = page.getByLabel("Buscar por referencia");
  await search.fill("pac-m");
  await page.waitForTimeout(400);
  await page.getByText("PAC-MULTI", { exact: true }).waitFor();
  assertTruthy(await page.getByText("PAC-ZERO", { exact: true }).count() === 0, "search por prefijo debe filtrar sin fuzzy matching");
  await page.getByRole("button", { name: /Limpiar/ }).click();

  await page.goto(`${appUrl}/pacientes/${zeroId}`);
  await page.getByRole("heading", { name: "PAC-ZERO" }).waitFor();
  await page.getByText(/todav.*no tiene estudios asociados/).waitFor();
  await assertResponsive(page, 390, 844, "zero");

  await page.goto(`${appUrl}/pacientes/${multipleId}`);
  await page.getByRole("heading", { name: "PAC-MULTI" }).waitFor();
  const caseLabels = await page.locator(".patient-study-card h3").allTextContents();
  assertTruthy(JSON.stringify(caseLabels) === JSON.stringify(["CASE-NEW", "CASE-OLD"]), "timeline debe mantener orden longitudinal");
  await assertResponsive(page, 1366, 768, "detail");
  await assertResponsive(page, 1920, 1080, "detail");
  await assertResponsive(page, 390, 844, "detail");

  await page.getByRole("button", { name: "Abrir estudio" }).first().click();
  await page.waitForURL(`${appUrl}/estudio/CASE-NEW`);

  await page.goto(`${appUrl}/pacientes/no-es-uuid`);
  await page.getByRole("heading", { name: "Paciente no encontrado" }).waitFor();

  console.log("Patient PR4 Playwright E2E passed: list, search, zero, timeline, route, invalid-id, responsive");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
