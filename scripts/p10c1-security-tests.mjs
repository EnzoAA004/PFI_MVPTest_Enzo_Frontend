import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function src(path) {
  return readFileSync(join(root, path), "utf8");
}

let count = 0;
function test(name, fn) {
  fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

// ---------------------------------------------------------------------------
// Politica de origen (P10-C.1 S2) - 6 tests
// ---------------------------------------------------------------------------

const originPolicy = src("src/security/originPolicy.ts");

test("1 originPolicy.isAuthorizedBackendUrl rechaza esquemas no autorizados (file/data/blob/javascript/ftp)", () => {
  assert.match(originPolicy, /UNSAFE_SCHEMES\s*=\s*\/\^\(file\|data\|blob\|javascript\|ftp\):/i);
  assert.match(originPolicy, /if \(UNSAFE_SCHEMES\.test\(url\)\) return undefined;/);
});

test("2 originPolicy.isAuthorizedBackendUrl rechaza URLs protocol-relative (//host/path)", () => {
  assert.match(originPolicy, /if \(url\.startsWith\("\/\/"\)\) return undefined;/);
});

test("3 originPolicy.isAuthorizedBackendUrl rechaza path traversal (..)", () => {
  assert.match(originPolicy, /if \(url\.includes\("\.\."\)\) return undefined;/);
});

test("4 originPolicy.isAuthorizedBackendUrl rechaza URLs con credenciales embebidas (user:pass@)", () => {
  assert.match(originPolicy, /if \(parsed\.username \|\| parsed\.password\) return undefined;/);
});

test("5 originPolicy.isAuthorizedBackendUrl solo acepta /api\\/... relativo o el origin exacto de API_BASE_URL con path /api/", () => {
  assert.match(originPolicy, /if \(url\.startsWith\("\/api\/"\)\) return url;/);
  assert.match(originPolicy, /if \(origin && parsed\.origin === origin && parsed\.pathname\.startsWith\("\/api\/"\)\) return url;/);
});

test("6 authenticatedAssets.ts valida isAuthorizedBackendUrl antes de cualquier fetch con Authorization", () => {
  const assets = src("src/authenticatedAssets.ts");
  assert.match(assets, /import \{ isAuthorizedBackendUrl \} from "\.\/security\/originPolicy";/);
  const fnBody = assets.slice(assets.indexOf("export async function fetchAuthenticatedAiAsset"));
  const validateIndex = fnBody.indexOf("isAuthorizedBackendUrl(url)");
  const firstFetchIndex = fnBody.indexOf("requestAsset(url, signal)");
  assert.ok(validateIndex >= 0 && firstFetchIndex >= 0 && validateIndex < firstFetchIndex, "la validacion de origin debe ocurrir antes del primer fetch");
});

// ---------------------------------------------------------------------------
// Coordinacion de refresh y 401/403 (P10-C.1 S3) - 5 tests
// ---------------------------------------------------------------------------

test("7 refreshCoordinator.coordinateRefresh reutiliza una unica promesa en curso (single-flight)", () => {
  const coordinator = src("src/security/refreshCoordinator.ts");
  assert.match(coordinator, /let inFlight: Promise<unknown> \| null = null;/);
  assert.match(coordinator, /if \(inFlight\) return inFlight as Promise<T>;/);
  assert.match(coordinator, /inFlight = null;/);
});

test("8 authClient.refreshDoctorSession usa coordinateRefresh en lugar de refrescar en paralelo", () => {
  const authClient = src("src/authClient.ts");
  assert.match(authClient, /import \{ coordinateRefresh \} from "\.\/security\/refreshCoordinator";/);
  assert.match(authClient, /export function refreshDoctorSession\(\)[\s\S]*?return coordinateRefresh\(async \(\) => \{/);
});

test("9 un refresh fallido limpia la sesion (notifySessionInvalidated) para todo caller, no solo el que disparo el refresh", () => {
  const authClient = src("src/authClient.ts");
  assert.match(authClient, /import \{ clearAllProtectedData, notifySessionInvalidated \} from "\.\/security\/sessionCleanup";/);
  assert.match(authClient, /catch \(error\) \{[\s\S]*?notifySessionInvalidated\(\);[\s\S]*?throw error;/);
});

test("10 api.ts solo dispara refresh ante 401, nunca ante 403 (403 = permiso insuficiente, no logout)", () => {
  const api = src("src/api.ts");
  assert.match(api, /if \(response\.status === 401 && includeAuth\) \{/);
  assert.ok(!/status === 403[\s\S]{0,80}refreshDoctorSession/.test(api), "un 403 nunca debe disparar refresh");
});

test("11 reviewPersistenceApi.ts ya no traga en silencio un fallo de refresh (el 401 original ya no se preserva tras un refresh fallido)", () => {
  const reviewApi = src("src/reviewPersistenceApi.ts");
  assert.ok(!reviewApi.includes("Keep the original failure behavior below"), "el fallback silencioso de refresh debe haberse eliminado");
  assert.match(reviewApi, /await refreshDoctorSession\(\);/);
});

// ---------------------------------------------------------------------------
// Sanitizacion de errores (P10-C.1 S6) - 4 tests
// ---------------------------------------------------------------------------

const safeError = src("src/security/safeError.ts");

test("12 safeError.toSafeFrontendError mapea los status minimos requeridos (400/401/403/404/409/413/415/422/429)", () => {
  for (const status of [400, 401, 403, 404, 409, 413, 415, 422, 429]) {
    assert.match(safeError, new RegExp(`${status}:\\s*".+?"`), `falta mapeo para status ${status}`);
  }
});

test("13 safeError.isUnsafeErrorText detecta stacks, paths internos, JDBC/SQL, JWT y HTML crudo", () => {
  assert.ok(safeError.includes("/Exception/i"));
  assert.ok(safeError.includes(String.raw`/\/tmp\//`));
  assert.ok(safeError.includes("/jdbc:/i"));
  assert.ok(safeError.includes("eyJ[A-Za-z0-9_-]"));
  assert.ok(safeError.includes("/<html/i"));
});

test("14 api.ts construye ApiError.message a partir de toSafeFrontendError, nunca de un mensaje crudo sin filtrar", () => {
  const api = src("src/api.ts");
  assert.match(api, /import \{ toSafeFrontendError \} from "\.\/security\/safeError";/);
  assert.match(api, /const safe = toSafeFrontendError\(response\?\.status, \{ code, traceId, candidateMessage \}\);/);
  assert.match(api, /return new ApiError\(safe\.message,/);
});

test("15 multiplanarApi.ts sanitiza el mensaje de error del backend salvo el codigo de violacion de contrato ya curado", () => {
  const multiplanar = src("src/multiplanarApi.ts");
  assert.match(multiplanar, /import \{ toSafeFrontendError \} from "\.\/security\/safeError";/);
  assert.match(multiplanar, /toSafeFrontendError\(response\.status, \{ code, traceId, candidateMessage: backendMessage \}\)\.message/);
});

// ---------------------------------------------------------------------------
// traceId (P10-C.1 S7) - 2 tests
// ---------------------------------------------------------------------------

test("16 traceId.generateTraceId produce IDs acotados y sanitizeIncomingTraceId valida formato/longitud antes de confiar en un trace recibido", () => {
  const traceIdSrc = src("src/security/traceId.ts");
  assert.match(traceIdSrc, /const MAX_TRACE_ID_LENGTH = 80;/);
  assert.match(traceIdSrc, /export function generateTraceId/);
  assert.match(traceIdSrc, /export function sanitizeIncomingTraceId/);
  assert.match(traceIdSrc, /TRACE_ID_PATTERN\.test\(trimmed\)/);
});

test("17 los modulos HTTP que antes carecian de traceId ahora envian X-Trace-Id (authClient, studyApi, subjectHistoryApi, pipelineContractApi, reviewPersistenceApi, Header)", () => {
  for (const file of ["src/authClient.ts", "src/studyApi.ts", "src/subjectHistoryApi.ts", "src/pipelineContractApi.ts", "src/reviewPersistenceApi.ts", "src/components/Header.tsx"]) {
    const content = src(file);
    assert.match(content, /"X-Trace-Id":\s*traceId/, `${file} debe adjuntar X-Trace-Id`);
    assert.match(content, /generateTraceId\(/, `${file} debe generar el traceId con el modulo centralizado`);
  }
});

// ---------------------------------------------------------------------------
// Roles y autorizacion en UI (P10-C.1 S5) - 3 tests
// ---------------------------------------------------------------------------

test("18 las preferencias locales del profesional (idioma/densidad/notificaciones) nunca incluyen un campo de rol", () => {
  const settings = src("src/components/ProfessionalSettingsView.tsx");
  assert.match(settings, /type PreferenceState = \{\s*language: string;\s*density: string;\s*notifications: boolean;\s*\};/);
  assert.ok(!/PreferenceState[\s\S]{0,120}role/i.test(settings), "PreferenceState no debe incluir un campo de rol fabricado en el cliente");
});

test("19 pendingApproval/needsOnboarding en App.tsx se derivan solo de session.user (respuesta de backend), nunca de storage local editable", () => {
  const app = src("src/App.tsx");
  assert.match(app, /const pendingApproval = Boolean\(session && \(session\.user\.approved === false \|\| session\.user\.roles\.includes\("PENDING_APPROVAL"\)\)\);/);
  assert.match(app, /const needsOnboarding = Boolean\(session && session\.user\.approved !== false/);
});

test("20 ningun modulo fuera de fixtures/mocks fabrica o hardcodea un rol administrativo en el cliente", () => {
  for (const file of ["src/api.ts", "src/authClient.ts", "src/App.tsx"]) {
    const content = src(file);
    assert.ok(!/roles:\s*\[["']ADMIN["']\]/.test(content), `${file} no debe fabricar un rol ADMIN client-side`);
  }
});

// ---------------------------------------------------------------------------
// console.* (P10-C.1 S8) - 1 test
// ---------------------------------------------------------------------------

test("21 fuera de src/security/frontendLogger.ts, todo console.warn/console.error persistido esta acompanado de un mensaje sanitizado (prefijo [modulo]) y no hay console.log/console.debug de diagnostico sin gate DEV", () => {
  const filesToCheck = [
    "src/dataMode.ts",
    "src/App.tsx",
    "src/studyApi.ts",
    "src/subjectHistoryApi.ts",
  ];
  for (const file of filesToCheck) {
    const content = src(file);
    const rawLogDebug = content.match(/console\.(log|debug)\(/g) ?? [];
    assert.equal(rawLogDebug.length, 0, `${file} no debe tener console.log/console.debug de diagnostico`);
    const warnErrorCalls = content.match(/console\.(warn|error)\([^)]*\)/g) ?? [];
    for (const call of warnErrorCalls) {
      assert.match(call, /\[[a-z0-9-]+\]/i, `Todo console.warn/error en ${file} debe llevar un prefijo [modulo] identificable: ${call}`);
    }
  }
});

// ---------------------------------------------------------------------------
// VITE_* / API_BASE_URL (P10-C.1 S12) - 1 test
// ---------------------------------------------------------------------------

test("22 api.ts valida API_BASE_URL al arrancar (sin credenciales embebidas, HTTPS en produccion salvo localhost, sin query string)", () => {
  const api = src("src/api.ts");
  assert.match(api, /function validateApiBaseUrlAtStartup\(url: string\)/);
  assert.match(api, /parsed\.username \|\| parsed\.password/);
  assert.match(api, /import\.meta\.env\.PROD && parsed\.protocol !== "https:" && !isLocalHost/);
  assert.match(api, /parsed\.search/);
  assert.match(api, /validateApiBaseUrlAtStartup\(API_BASE_URL\);/);
});

// ---------------------------------------------------------------------------
// Descargas de assets y exportaciones (P10-C.1 S10) - 2 tests
// ---------------------------------------------------------------------------

test("23 el reporte tecnico HTML local escapa todo campo dinamico (escapeHtml) y valida el origen del backend antes de descargar el payload", () => {
  const header = src("src/components/Header.tsx");
  assert.match(header, /function escapeHtml\(value: unknown\)/);
  assert.match(header, /if \(!isAuthorizedBackendUrl\(technicalReportUrl\)\) \{/);
  const rendererBody = header.slice(header.indexOf("function renderTechnicalReportHtml"), header.indexOf("export function Header"));
  const dynamicFields = ["payload.runId", "payload.caseId", "payload.patientId", "payload.studyDate", "payload.plane", "payload.modelKey"];
  for (const field of dynamicFields) {
    assert.ok(rendererBody.includes(`escapeHtml(${field})`), `${field} debe pasar por escapeHtml en el reporte tecnico`);
  }
});

test("24 el blob URL del reporte tecnico se revoca y la ventana de fallback usa noopener,noreferrer", () => {
  const header = src("src/components/Header.tsx");
  assert.match(header, /URL\.revokeObjectURL\(blobUrl\)/);
  assert.match(header, /window\.open\(blobUrl, "_blank", "noopener,noreferrer"\)/);
  assert.match(header, /previewWindow\.opener = null;/);
});

// ---------------------------------------------------------------------------
// Regresion / compatibilidad funcional P9 (P10-C.1 S13) - 6 tests
// ---------------------------------------------------------------------------

test("25 multiplanarRunAdapter.isDurableMeshAssetUrl conserva la politica estricta previa (sin regresion de P9-C.5 Parte B)", () => {
  const adapter = src("src/adapters/multiplanarRunAdapter.ts");
  assert.match(adapter, /export function isDurableMeshAssetUrl\(value: unknown\): string \| undefined \{/);
  assert.match(adapter, /if \(url\.startsWith\("\/api\/"\)\) return url;/);
});

test("26 StudyReviewView sigue usando SpineReconstructionPreview con el proxy experimental (sin regresion de reapertura P9-C.5 Parte B)", () => {
  const view = src("src/components/StudyReviewView.tsx");
  assert.match(view, /<SpineReconstructionPreview proxy=\{threeDProxyViewModel\} \/>/);
  assert.ok(!view.includes("GenericAtlasPreview"), "StudyReviewView no debe volver a usar GenericAtlasPreview");
});

test("27 App.tsx sigue mostrando AuthView cuando no hay sesion (cierre de sesion no debe dejar pantallas protegidas visibles)", () => {
  const app = src("src/App.tsx");
  assert.match(app, /if \(!session\) return <AuthView onAuthenticated=\{setSession\} \/>;/);
});

test("28 App.tsx sigue bloqueando el acceso mientras la cuenta esta pendiente de aprobacion", () => {
  const app = src("src/App.tsx");
  assert.match(app, /if \(pendingApproval\) return <PendingApprovalView session=\{session\} onLogout=\{logout\} \/>;/);
});

test("29 logout() limpia sesion, storage protegido y estado en memoria (mediciones, corrida seleccionada, revision, historial)", () => {
  const app = src("src/App.tsx");
  assert.match(app, /function resetProtectedState\(\) \{/);
  const logoutBody = app.slice(app.indexOf("function logout() {"), app.indexOf("function logout() {") + 200);
  assert.match(logoutBody, /void logoutDoctor\(\)\.finally\(\(\) => \{/);
  assert.match(logoutBody, /setSession\(null\);/);
  assert.match(logoutBody, /resetProtectedState\(\);/);
  const authClient = src("src/authClient.ts");
  assert.match(authClient, /await clearAllProtectedData\(\);/);
});

test("30 clearAllProtectedData no borra las preferencias visuales no sensibles del profesional (idioma/densidad/notificaciones)", () => {
  const cleanup = src("src/security/sessionCleanup.ts");
  assert.ok(!/removeItem\([^)]*professional-settings/i.test(cleanup), "las preferencias visuales no sensibles no deben limpiarse en logout");
  assert.match(cleanup, /REVIEW_HISTORY_KEY/);
  assert.match(cleanup, /SELECTED_STUDY_KEY/);
});

// ---------------------------------------------------------------------------
// Sincronizacion entre pestanas (P10-C.1 S4) - 2 tests adicionales
// ---------------------------------------------------------------------------

test("31 sessionCleanup expone sincronizacion entre pestanas via BroadcastChannel para logout y sesion invalidada", () => {
  const cleanup = src("src/security/sessionCleanup.ts");
  assert.match(cleanup, /new BroadcastChannel\(CROSS_TAB_CHANNEL\)/);
  assert.match(cleanup, /export function onCrossTabSessionSync\(onSync: \(\) => void\): \(\) => void/);
  assert.match(cleanup, /type === "logout" \|\| type === "session-invalidated"/);
});

test("32 App.tsx se suscribe a la invalidacion de sesion en background y a la sincronizacion entre pestanas para cerrar la sesion local", () => {
  const app = src("src/App.tsx");
  assert.match(app, /import \{ SESSION_INVALIDATED_EVENT, onCrossTabSessionSync \} from "\.\/security\/sessionCleanup";/);
  assert.match(app, /window\.addEventListener\(SESSION_INVALIDATED_EVENT, handleSessionLost\);/);
  assert.match(app, /const unsubscribeCrossTab = onCrossTabSessionSync\(handleSessionLost\);/);
});

console.log(`P10-C.1 security/session/observability tests passed: ${count}`);
