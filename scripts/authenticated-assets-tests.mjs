import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("src/authenticatedAssets.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let currentToken = "token-a";
let refreshCount = 0;
let fetchQueue = [];
const calls = [];
const revokedUrls = [];
let objectUrlCount = 0;

function reset() {
  currentToken = "token-a";
  refreshCount = 0;
  fetchQueue = [];
  calls.length = 0;
  revokedUrls.length = 0;
  objectUrlCount = 0;
}

function response(status, contentType = "image/png") {
  return new Response(new Blob(["asset"], { type: contentType }), {
    status,
    headers: { "Content-Type": contentType },
  });
}

const context = {
  exports: {},
  fetch: (url, init = {}) => {
    calls.push({ url: String(url), init, authorization: init.headers?.Authorization, signal: init.signal });
    const next = fetchQueue.shift();
    if (next instanceof Promise) return next;
    return Promise.resolve(next ?? response(200));
  },
  Blob,
  Response,
  AbortController,
  URL: {
    createObjectURL: () => `blob:asset-${++objectUrlCount}`,
    revokeObjectURL: (url) => revokedUrls.push(url),
  },
  require: (id) => {
    if (id === "react") return { useEffect: () => undefined, useState: (initial) => [initial, () => undefined] };
    if (id === "./authClient") return {
      authHeaders: () => ({ Authorization: `Bearer ${currentToken}` }),
      refreshDoctorSession: async () => {
        refreshCount += 1;
        currentToken = "token-b";
      },
    };
    if (id === "./security/originPolicy") return {
      isAuthorizedBackendUrl: (url) => (typeof url === "string" && url.trim() ? url : undefined),
    };
    // El asset espera la hidratación de la sesión antes de pedir: en la app la
    // sesión vive en IndexedDB y sin esperarla el request sale sin Authorization.
    if (id === "./authStorage") return { ensureAuthSession: async () => null };
    return {};
  },
};

vm.runInNewContext(compiled, context, { filename: "authenticatedAssets.js" });

const {
  createAuthenticatedImageObjectUrl,
  fetchAuthenticatedAiAsset,
  startAuthenticatedImageLoad,
  clearAuthenticatedImageCache,
} = context.exports;

let count = 0;
async function test(name, fn) {
  reset();
  await fn();
  count += 1;
  console.log(`ok ${count} - ${name}`);
}

await test("A fetch de input.png incluye Authorization Bearer", async () => {
  fetchQueue = [response(200)];
  await fetchAuthenticatedAiAsset("https://backend.example/api/ai/assets/run/sagittal/input.png");
  assert.equal(calls[0].authorization, "Bearer token-a");
});

await test("B fetch de overlay.png incluye Authorization Bearer", async () => {
  fetchQueue = [response(200)];
  await fetchAuthenticatedAiAsset("https://backend.example/api/ai/assets/run/sagittal/overlay.png");
  assert.equal(calls[0].authorization, "Bearer token-a");
});

await test("C 401 provoca un unico refresh y reintento", async () => {
  fetchQueue = [response(401, "text/plain"), response(200)];
  await fetchAuthenticatedAiAsset("https://backend.example/api/ai/assets/run/sagittal/input.png");
  assert.equal(refreshCount, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].authorization, "Bearer token-b");
});

await test("D segundo 401 produce failed/error sin bucle", async () => {
  fetchQueue = [response(401, "text/plain"), response(401, "text/plain")];
  await assert.rejects(() => fetchAuthenticatedAiAsset("https://backend.example/api/ai/assets/run/sagittal/input.png"), /401/);
  assert.equal(refreshCount, 1);
  assert.equal(calls.length, 2);
});

await test("E image/png genera blob URL", async () => {
  fetchQueue = [response(200, "image/png")];
  const objectUrl = await createAuthenticatedImageObjectUrl("https://backend.example/api/ai/assets/run/sagittal/input.png");
  assert.equal(objectUrl, "blob:asset-1");
});

await test("F application/json no se acepta como imagen", async () => {
  fetchQueue = [response(200, "application/json")];
  await assert.rejects(() => fetchAuthenticatedAiAsset("https://backend.example/api/ai/assets/run/sagittal/input.png"), /Content-Type application\/json/);
});

// El blob ya no lo revoca el cleanup sino la cache, que es su duena: recorrer una
// serie vuelve al mismo corte constantemente y revocar al desmontar obligaba a
// descargarlo de nuevo cada vez. Lo que estas tres pruebas siguen garantizando es
// lo mismo que garantizaba la original: que ningun blob URL quede sin revocar.
await test("G el cleanup conserva el blob para reutilizarlo", async () => {
  clearAuthenticatedImageCache();
  revokedUrls.length = 0;
  fetchQueue = [response(200)];
  const states = [];
  const cleanup = startAuthenticatedImageLoad("https://backend.example/api/ai/assets/run/sagittal/input.png", (state) => states.push(state));
  while (!states.at(-1)?.url) await new Promise((resolve) => setTimeout(resolve, 1));
  cleanup();
  assert.equal(states.at(-1).url, "blob:asset-1");
  assert.deepEqual(revokedUrls, []);
});

await test("G.1 un asset ya descargado se sirve de cache sin volver a pedirlo", async () => {
  const url = "https://backend.example/api/ai/assets/run/sagittal/input.png";
  clearAuthenticatedImageCache();
  fetchQueue = [response(200)];
  const first = [];
  startAuthenticatedImageLoad(url, (state) => first.push(state));
  while (!first.at(-1)?.url) await new Promise((resolve) => setTimeout(resolve, 1));
  const callsBefore = calls.length;
  const second = [];
  startAuthenticatedImageLoad(url, (state) => second.push(state));
  assert.equal(calls.length, callsBefore, "no debe repetir el fetch");
  // Se comparan los campos y no el objeto: lo devuelve el modulo cargado dentro del
  // vm, cuyo Object.prototype es otro y hace fallar a deepStrictEqual.
  assert.equal(second.length, 1, "debe resolver en un solo paso, sin estado loading");
  assert.equal(second[0].state, "loaded");
  assert.equal(second[0].url, first.at(-1).url);
});

await test("G.2 limpiar la cache revoca todos los blob URL", async () => {
  clearAuthenticatedImageCache();
  revokedUrls.length = 0;
  const states = [];
  fetchQueue = [response(200)];
  startAuthenticatedImageLoad("https://backend.example/api/ai/assets/run/sagittal/slice-004.png", (state) => states.push(state));
  while (!states.at(-1)?.url) await new Promise((resolve) => setTimeout(resolve, 1));
  const objectUrl = states.at(-1).url;
  clearAuthenticatedImageCache();
  assert.deepEqual(revokedUrls, [objectUrl]);
});

await test("H cambio de runId cancela el fetch anterior", async () => {
  let resolveFirst;
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  fetchQueue = [first, response(200)];
  const cleanupFirst = startAuthenticatedImageLoad("https://backend.example/api/ai/assets/run-a/sagittal/input.png", () => undefined);
  // El fetch ahora espera la hidratación de la sesión, así que ya no sale de forma
  // síncrona: se espera a que la llamada exista antes de inspeccionarla.
  while (!calls.length) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls[0].signal.aborted, false);
  cleanupFirst();
  assert.equal(calls[0].signal.aborted, true);
  startAuthenticatedImageLoad("https://backend.example/api/ai/assets/run-b/sagittal/input.png", () => undefined);
  resolveFirst(response(200));
});

await test("I el JWT nunca aparece en la URL", async () => {
  fetchQueue = [response(200)];
  const objectUrl = await createAuthenticatedImageObjectUrl("https://backend.example/api/ai/assets/run/sagittal/input.png");
  assert.equal(calls[0].url.includes("token-a"), false);
  assert.equal(calls[0].url.includes("Bearer"), false);
  assert.equal(objectUrl.includes("token-a"), false);
});

console.log(`Authenticated asset tests passed: ${count}`);
