import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

/**
 * P10-C.1 hotfix: /api/ai/health and /api/ai/models are protected endpoints
 * (any authenticated, non-pending professional per the Backend's AuthFilter
 * default gate) — not public, not ADMIN-only. getHealth()/getModels() must
 * always attach Authorization and participate in the coordinated refresh on
 * 401, same as every other protected call. This exercises that behavior by
 * loading the real src/api.ts logic into a sandbox with a scriptable fetch.
 */

const root = process.cwd();

function loadApi({ fetchImpl, authHeadersImpl, refreshDoctorSessionImpl }) {
  const source = readFileSync(join(root, "src/api.ts"), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/import\.meta\.env/g, "({})")
    .replace(/export /g, "");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let traceCounter = 0;
  const sandbox = {
    exports: {},
    window: undefined,
    console,
    URL,
    fetch: fetchImpl,
    authHeaders: authHeadersImpl,
    refreshDoctorSession: refreshDoctorSessionImpl,
    markDataOrigin: (value, dataOrigin) => ({ ...value, dataOrigin }),
    isDemoDataMode: false,
    isRealDataMode: true,
    appDataMode: "real",
    frontendLogger: { debug() {}, warn() {}, error() {} },
    toSafeFrontendError: (status, options = {}) => ({ message: options.candidateMessage ?? `status ${status}`, status, code: options.code, traceId: options.traceId }),
    generateTraceId: (scope = "frontend") => `${scope}-${++traceCounter}`,
  };
  vm.runInNewContext(`${js}\nexports.getHealth = getHealth;\nexports.getModels = getModels;\nexports.getPublicSystemHealth = getPublicSystemHealth;`, sandbox);
  return sandbox.exports;
}

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    clone() { return this; },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

let count = 0;
async function test(name, fn) {
  await fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

await test("1 getHealth() y getModels() adjuntan Authorization (endpoints protegidos, no publicos)", async () => {
  const calls = [];
  const api = loadApi({
    fetchImpl: async (url, init) => { calls.push({ url, authorization: init.headers.Authorization }); return response(200, url.includes("models") ? [] : { status: "ok" }); },
    authHeadersImpl: () => ({ Authorization: "Bearer approved-doctor-token" }),
    refreshDoctorSessionImpl: async () => undefined,
  });
  await api.getHealth();
  await api.getModels();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].authorization, "Bearer approved-doctor-token", "getHealth debe enviar el access token");
  assert.equal(calls[1].authorization, "Bearer approved-doctor-token", "getModels debe enviar el access token");
});

await test("2 un 401 en getHealth() dispara exactamente un refresh coordinado y reintenta", async () => {
  let refreshCalls = 0;
  const calls = [];
  const api = loadApi({
    fetchImpl: async (url, init) => {
      calls.push({ url, authorization: init.headers.Authorization });
      if (calls.length === 1) return response(401, { message: "Unauthorized" });
      return response(200, { status: "ok" });
    },
    authHeadersImpl: () => ({ Authorization: "Bearer token" }),
    refreshDoctorSessionImpl: async () => { refreshCalls += 1; },
  });
  await api.getHealth();
  assert.equal(refreshCalls, 1);
  assert.equal(calls.length, 2);
});

await test("3 el reintento tras 401 conserva el mismo traceId de la solicitud original", async () => {
  const traceIds = [];
  const api = loadApi({
    fetchImpl: async (url, init) => {
      traceIds.push(init.headers["X-Trace-Id"]);
      if (traceIds.length === 1) return response(401, { message: "Unauthorized" });
      return response(200, { status: "ok" });
    },
    authHeadersImpl: () => ({ Authorization: "Bearer token" }),
    refreshDoctorSessionImpl: async () => undefined,
  });
  await api.getModels();
  assert.equal(traceIds.length, 2);
  assert.ok(traceIds[0], "debe haber un traceId en el primer intento");
  assert.equal(traceIds[0], traceIds[1], "el traceId del reintento debe ser el mismo que el original");
});

await test("4-5 un profesional aprobado (DOCTOR) y un ADMIN consultan health/models con exito, ambos enviando su propio token", async () => {
  for (const role of ["DOCTOR", "ADMIN"]) {
    const calls = [];
    const api = loadApi({
      fetchImpl: async (url, init) => { calls.push({ url, authorization: init.headers.Authorization }); return response(200, url.includes("models") ? [] : { status: "ok" }); },
      authHeadersImpl: () => ({ Authorization: `Bearer token-${role}` }),
      refreshDoctorSessionImpl: async () => undefined,
    });
    const health = await api.getHealth();
    const models = await api.getModels();
    assert.equal(health.status, "ok");
    assert.deepEqual(models, []);
    assert.ok(calls.every((call) => call.authorization === `Bearer token-${role}`));
  }
});

await test("6 App.tsx no inicia el bootstrap (getHealth/getModels/getStudies) mientras la cuenta esta pendingApproval", async () => {
  const app = readFileSync(join(root, "src/App.tsx"), "utf8");
  assert.match(app, /if \(!session \|\| pendingApproval\) return;/, "el efecto de bootstrap debe salir temprano si pendingApproval es true, antes de llamar a getHealth/getModels/getStudies");
});

await test("7 un 403 en getHealth()/getModels() nunca dispara refresh (permiso insuficiente, no sesion invalida)", async () => {
  let refreshCalls = 0;
  const api = loadApi({
    fetchImpl: async () => response(403, { message: "Access is denied" }),
    authHeadersImpl: () => ({ Authorization: "Bearer token" }),
    refreshDoctorSessionImpl: async () => { refreshCalls += 1; },
  });
  await assert.rejects(() => api.getHealth(), /status 403|Access is denied/);
  assert.equal(refreshCalls, 0);
});

await test("8 el liveness pre-login usa /api/system/health (publico), nunca /api/ai/health, y no adjunta Authorization", async () => {
  const calls = [];
  const api = loadApi({
    fetchImpl: async (url, init) => { calls.push({ url, authorization: init.headers.Authorization }); return response(200, { status: "ok" }); },
    authHeadersImpl: () => ({ Authorization: "Bearer should-never-be-sent" }),
    refreshDoctorSessionImpl: async () => undefined,
  });
  await api.getPublicSystemHealth();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("/api/system/health"), "debe apuntar a /api/system/health");
  assert.ok(!calls[0].url.includes("/api/ai/health"), "el liveness publico no debe reusar /api/ai/health");
  assert.equal(calls[0].authorization, undefined, "el liveness publico no debe adjuntar Authorization");
});

console.log(`P10-C.1 hotfix protected-endpoints tests passed: ${count}`);
