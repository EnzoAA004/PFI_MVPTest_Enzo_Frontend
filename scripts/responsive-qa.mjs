import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:5175";
const screenshotDir = ".qa/fe-p8";
const breakpoints = [
  { name: "mobile-360", width: 360, height: 900 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 900 },
];

const demoSession = {
  accessToken: "qa-demo-access-token",
  refreshToken: "qa-demo-refresh-token",
  tokenType: "Bearer",
  expiresInSeconds: 3600,
  user: {
    id: "qa-demo-user",
    fullName: "Dra. Demo QA",
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

const views = [
  { name: "dashboard", open: async (page) => clickSidebar(page, /Inicio/i) },
  { name: "studies", open: async (page) => clickSidebar(page, /Estudios/i) },
  { name: "queue", open: async (page) => clickSidebar(page, /Cola de revision|Cola de revisión/i) },
  { name: "patients", open: async (page) => clickSidebar(page, /Pacientes/i) },
  { name: "history", open: async (page) => clickSidebar(page, /Historial/i) },
  { name: "analysis", open: async (page) => clickSidebar(page, /Nuevo analisis|Nuevo análisis/i) },
  { name: "settings", open: async (page) => clickSidebar(page, /Configuracion|Configuración/i) },
  { name: "help", open: async (page) => clickSidebar(page, /Ayuda|Soporte/i) },
  {
    name: "case-review-3d",
    open: async (page) => {
      await clickSidebar(page, /Inicio/i);
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: /Abrir revision|Abrir revisión/i }).click();
      await page.waitForTimeout(600);
      await page.getByRole("tab", { name: /Reconstruccion 3D|Reconstrucción 3D/i }).click().catch(async () => {
        await page.getByText(/Reconstruccion 3D|Reconstrucción 3D/i).click();
      });
    },
  },
];

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
  await page.waitForSelector(".app-layout", { timeout: 15000 });
}

async function clickSidebar(page, name) {
  await page.locator(".sidebar").getByRole("button", { name }).click();
}

async function overflowReport(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = Math.max(0, doc.scrollWidth - doc.clientWidth);
    const allowedScrollable = ".table-wrap, .side-nav, .workspace-tabs, .viewer-controls, .three-d-controls, .worklist-filter-tabs";
    const offenders = Array.from(document.querySelectorAll("body *"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          width: Math.round(rect.width),
          right: Math.round(rect.right),
          left: Math.round(rect.left),
          allowed: Boolean(element.closest(allowedScrollable)),
        };
      })
      .filter((item) => item.right > doc.clientWidth + 2 || item.left < -2)
      .slice(0, 8);
    const pageOffenders = offenders.filter((item) => !item.allowed);
    return { overflowX, pageOverflowX: pageOffenders.length ? overflowX : 0, offenders };
  });
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
  const results = [];
  try {
    for (const breakpoint of breakpoints) {
      const context = await browser.newContext({ viewport: { width: breakpoint.width, height: breakpoint.height } });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      await seedSession(page);
      for (const view of views) {
        await view.open(page);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await page.waitForTimeout(800);
        const report = await overflowReport(page);
        const path = `${screenshotDir}/${breakpoint.name}-${view.name}.png`;
        await page.screenshot({ path, fullPage: true });
        results.push({ breakpoint: breakpoint.name, view: view.name, screenshot: path, ...report });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.pageOverflowX > 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
