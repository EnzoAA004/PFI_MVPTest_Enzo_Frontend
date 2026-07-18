import { AxeBuilder } from "@axe-core/playwright";
import { chromium } from "playwright";

const baseUrl = process.env.AXE_BASE_URL ?? "http://127.0.0.1:5175";
const targetRules = new Set([
  "color-contrast",
  "aria-required-children",
  "empty-table-header",
  "scrollable-region-focusable",
]);

const demoSession = {
  accessToken: "axe-demo-access-token",
  refreshToken: "axe-demo-refresh-token",
  tokenType: "Bearer",
  expiresInSeconds: 3600,
  user: {
    id: "axe-demo-user",
    fullName: "Dra. Demo Accesibilidad",
    email: "doctor.demo@pfi.local",
    licenseNumber: "MP-0000",
    specialty: "Radiologia",
    institution: "PFI",
    roles: ["DOCTOR"],
    verified: true,
    approved: true,
    onboardingCompleted: true,
  },
  createdAt: new Date().toISOString(),
  storedAt: new Date().toISOString(),
};

async function seedSession(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (session) => {
    await new Promise((resolve, reject) => {
      const request = window.indexedDB.open("lumbar-mri-analysis-storage", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("kv", "readwrite");
        transaction.objectStore("kv").put(JSON.stringify(session), "lumbar-mri-auth-session-v1");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, demoSession);
  await page.reload({ waitUntil: "networkidle" });
}

async function openView(page, name, action) {
  await action();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(700);
  return audit(page, name);
}

async function audit(page, name) {
  const result = await new AxeBuilder({ page }).analyze();
  const seriousCritical = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  const targetCounts = Object.fromEntries([...targetRules].map((rule) => [rule, result.violations.find((violation) => violation.id === rule)?.nodes.length ?? 0]));
  return {
    name,
    url: page.url(),
    targetCounts,
    seriousCritical: seriousCritical.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
      help: violation.help,
      targets: violation.nodes.slice(0, 5).map((node) => node.target),
    })),
  };
}

async function clickByRole(page, role, name) {
  await page.getByRole(role, { name }).click();
}

async function clickSidebar(page, name) {
  await page.locator(".sidebar").getByRole("button", { name }).click();
}

async function main() {
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const results = [];
  try {
    await seedSession(page);
    await page.waitForSelector(".app-layout", { timeout: 15000 });

    results.push(await audit(page, "Dashboard"));
    results.push(await openView(page, "Studies", () => clickSidebar(page, /Estudios/i)));
    results.push(await openView(page, "Review Queue", () => clickSidebar(page, /Cola de revision|Cola de revisión/i)));
    results.push(await openView(page, "Patients", () => clickSidebar(page, /Pacientes/i)));
    results.push(await openView(page, "History", () => clickSidebar(page, /Historial/i)));
    results.push(await openView(page, "Nuevo analisis", () => clickSidebar(page, /Nuevo analisis|Nuevo análisis/i)));
    results.push(await openView(page, "Settings", () => clickSidebar(page, /Configuracion|Configuración/i)));
    results.push(await openView(page, "Help & Support", () => clickSidebar(page, /Ayuda|Soporte/i)));

    await clickSidebar(page, /Inicio/i);
    await page.waitForTimeout(500);
    const firstReviewButton = page.getByRole("button", { name: /Abrir revision|Abrir revisión|Revisar/i }).first();
    if (await firstReviewButton.count()) {
      await firstReviewButton.click();
    } else {
      await page.locator(".clickable-row").first().click();
    }
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(700);
    await clickByRole(page, "tab", /Reconstruccion 3D|Reconstrucción 3D/i).catch(async () => {
      await page.getByText(/Reconstruccion 3D|Reconstrucción 3D/i).click();
    });
    await page.waitForTimeout(700);
    results.push(await audit(page, "Case Review - Reconstruccion 3D"));
  } catch (error) {
    console.log(JSON.stringify(results, null, 2));
    throw error;
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(results, null, 2));
  const hasSeriousCritical = results.some((result) => result.seriousCritical.length > 0);
  const hasTargetRule = results.some((result) => Object.values(result.targetCounts).some((count) => count > 0));
  if (hasSeriousCritical || hasTargetRule) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
