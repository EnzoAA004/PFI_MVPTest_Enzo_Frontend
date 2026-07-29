import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();

function transpile(relativePath) {
  const source = readFileSync(join(root, relativePath), "utf8")
    .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/export (default )?/g, "");
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}

function loadModule(relativePath) {
  const js = transpile(relativePath);
  const sandbox = { exports: {}, module: { exports: {} }, console, Math, Array, Number };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  return sandbox;
}

const adapter = loadModule("src/adapters/volumeStackAdapter.ts");
const viewModel = loadModule("src/viewModels/volumeStackViewModel.ts");

const stubResolver = () => ({ image: "img.png", overlay: "ov.png" });

function planeRun(overrides = {}) {
  return {
    planeRunId: "sag-run-1",
    plane: "sagittal",
    model: {},
    assets: [],
    landmarks: [],
    measurements: [],
    input: { sliceCount: 24, selectedSliceIndex: 12, canonicalShape: [24, 320, 320], inPlaneSpacingMm: [0.7, 0.7] },
    ...overrides,
  };
}

// --- buildVolumeStack ---------------------------------------------------------
{
  const stack = adapter.buildVolumeStack(planeRun(), stubResolver);
  assert.equal(stack.plane, "sagittal");
  assert.equal(stack.seriesId, "sag-run-1");
  assert.equal(stack.sliceCount, 24);
  assert.equal(stack.selectedSliceIndex, 12);
  assert.deepEqual(stack.dimensions, [24, 320, 320]);
  assert.deepEqual(stack.inPlaneSpacingMm, [0.7, 0.7]);
  assert.equal(stack.slices.length, 24);
  // only the selected slice carries a real image/overlay + results
  const selected = stack.slices[12];
  assert.equal(selected.isSelected, true);
  assert.equal(selected.hasResult, true);
  assert.equal(selected.imageUrl, "img.png");
  assert.equal(selected.overlayUrl, "ov.png");
  const other = stack.slices[0];
  assert.equal(other.isSelected, false);
  assert.equal(other.hasResult, false);
  assert.equal(other.imageUrl, undefined);
  assert.equal(other.overlayUrl, undefined);
  console.log("ok buildVolumeStack: 24 slices, only index 12 has image/overlay/result");
}

// --- clamping / defensive inputs ---------------------------------------------
{
  const outOfRange = adapter.buildVolumeStack(planeRun({ input: { sliceCount: 10, selectedSliceIndex: 999 } }), stubResolver);
  assert.equal(outOfRange.sliceCount, 10);
  assert.equal(outOfRange.selectedSliceIndex, 9, "selectedSliceIndex clamps to last");
  assert.equal(outOfRange.slices[9].isSelected, true);

  const noCount = adapter.buildVolumeStack(planeRun({ input: {} }), stubResolver);
  assert.equal(noCount.sliceCount, 1, "missing sliceCount defaults to 1");
  assert.equal(noCount.selectedSliceIndex, 0);
  assert.equal(noCount.slices.length, 1);

  assert.equal(adapter.buildVolumeStack(null, stubResolver), null);
  console.log("ok clamping: out-of-range selectedSliceIndex and missing sliceCount handled");
}

// --- buildVolumeWorkspace -----------------------------------------------------
{
  const run = { planes: { sagittal: planeRun(), axial: planeRun({ planeRunId: "ax-run-1", plane: "axial", input: { sliceCount: 6, selectedSliceIndex: 3 } }) } };
  const ws = adapter.buildVolumeWorkspace(run, stubResolver);
  assert.equal(ws.sagittal.sliceCount, 24);
  assert.equal(ws.axial.sliceCount, 6);
  assert.equal(ws.axial.selectedSliceIndex, 3);
  assert.equal(Object.keys(adapter.buildVolumeWorkspace(null, stubResolver)).length, 0);
  console.log("ok buildVolumeWorkspace: sagittal + axial stacks");
}

// --- navigation pure functions ------------------------------------------------
{
  const { clampSliceIndex, initialSliceIndex, stepSliceIndex, sliceAt } = viewModel;
  assert.equal(clampSliceIndex(-5, 24), 0);
  assert.equal(clampSliceIndex(100, 24), 23);
  assert.equal(clampSliceIndex(12.9, 24), 12);
  assert.equal(stepSliceIndex(12, 1, 24), 13);
  assert.equal(stepSliceIndex(0, -1, 24), 0);
  assert.equal(stepSliceIndex(23, 1, 24), 23);
  const stack = adapter.buildVolumeStack(planeRun(), stubResolver);
  assert.equal(initialSliceIndex(stack), 12);
  assert.equal(sliceAt(stack, 12).isSelected, true);
  assert.equal(sliceAt(stack, -1).index, 0);
  console.log("ok navigation: clamp/step/initial/sliceAt");
}

console.log("\nP10.5-D.0 viewer-shell tests passed.");
