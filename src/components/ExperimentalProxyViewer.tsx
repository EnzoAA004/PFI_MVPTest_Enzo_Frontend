import { useEffect, useRef, useState } from "react";
import type { ThreeDProxyViewModel } from "../viewModels/threeDProxyViewModel";

/**
 * Pure presentation component: renders exactly the vertices/faces/structures
 * already validated and packaged into ThreeDProxyViewModel. Never receives
 * the HTTP response, the raw mesh JSON, or the canonical domain — mirrors the
 * MriSliceViewer pattern. Never mixed with GenericAtlasPreview.
 */

type Props = {
  viewModel: ThreeDProxyViewModel;
  onRetry?: () => void;
  /**
   * Optional controlled selection, for 2D<->3D coordination (P9-C.5 gap
   * closure): when provided by the caller, structure selection is driven
   * externally (e.g. from a 2D landmark pick) instead of local-only state.
   */
  selectedStructure?: string | null;
  onSelectStructure?: (label: string | null) => void;
};

const PALETTE = ["--primary", "--teal", "--warning", "--ai"];

function cssToken(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function ExperimentalProxyViewer({ viewModel, onRetry, selectedStructure: controlledSelectedStructure, onSelectStructure }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<{ rotate: (delta: number) => void; zoom: (delta: number) => void; fit: () => void; selectStructure: (label: string | null) => void; setRotationEnabled: (enabled: boolean) => void } | null>(null);
  const [rendererState, setRendererState] = useState<"loading" | "ready" | "failed">("loading");
  const [internalSelectedStructure, setInternalSelectedStructure] = useState<string | null>(null);
  const isControlled = controlledSelectedStructure !== undefined;
  const selectedStructure = isControlled ? controlledSelectedStructure : internalSelectedStructure;
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const rotationEnabledRef = useRef(false);
  const geometry = viewModel.state === "available" ? viewModel.geometry : undefined;

  useEffect(() => {
    if (!geometry) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasElement = canvas;
    let disposed = false;
    let cleanup = () => undefined as void;

    async function boot() {
      setRendererState("loading");
      try {
        const THREE = await import("three");
        if (disposed || !geometry) return;

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        const target = new THREE.Vector3(0, 0, 0);
        const orbit = { yaw: -0.46, pitch: 0.24, radius: 3.2 };

        const surface = cssToken("--surface", "white");
        const border = cssToken("--border", "lightgray");
        scene.add(new THREE.HemisphereLight(surface, border, 2.4));
        const keyLight = new THREE.DirectionalLight(surface, 2.6);
        keyLight.position.set(3, 4, 5);
        scene.add(keyLight);

        const positions = new Float32Array(geometry.vertices.length * 3);
        geometry.vertices.forEach(([x, y, z], index) => {
          positions[index * 3] = x - 0.5;
          positions[index * 3 + 1] = y - 0.5;
          positions[index * 3 + 2] = z - 0.5;
        });
        const indices = new Uint32Array(geometry.faces.length * 3);
        geometry.faces.forEach(([a, b, c], index) => {
          indices[index * 3] = a;
          indices[index * 3 + 1] = b;
          indices[index * 3 + 2] = c;
        });

        const bufferGeometry = new THREE.BufferGeometry();
        bufferGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
        bufferGeometry.computeVertexNormals();

        const materials = geometry.structures.map((_structure, index) =>
          new THREE.MeshStandardMaterial({ color: cssToken(PALETTE[index % PALETTE.length], "royalblue"), roughness: 0.55, metalness: 0.02, transparent: true, opacity: 0.88 }),
        );
        if (materials.length === 0) materials.push(new THREE.MeshStandardMaterial({ color: cssToken("--primary", "royalblue"), roughness: 0.55 }));

        if (geometry.structures.length > 0) {
          geometry.structures.forEach((structure, index) => {
            bufferGeometry.addGroup(structure.faceStart * 3, structure.faceCount * 3, index);
          });
        } else {
          bufferGeometry.addGroup(0, indices.length, 0);
        }

        const mesh = new THREE.Mesh(bufferGeometry, materials);
        mesh.name = "Experimental geometric proxy";
        scene.add(mesh);

        const structureIndexByLabel = new Map(geometry.structures.map((structure, index) => [structure.label, index]));

        function applyHighlight(label: string | null) {
          materials.forEach((material, index) => {
            const isSelected = label !== null && structureIndexByLabel.get(label) === index;
            material.emissive.set(isSelected ? cssToken("--primary", "royalblue") : "black");
            material.emissiveIntensity = isSelected ? 0.5 : 0;
            material.needsUpdate = true;
          });
          render();
        }

        function updateCamera() {
          const x = Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius;
          const y = target.y + Math.sin(orbit.pitch) * orbit.radius;
          const z = Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius;
          camera.position.set(x, y, z);
          camera.lookAt(target);
        }

        function resize() {
          const parent = canvasElement.parentElement;
          const width = Math.max(parent?.clientWidth ?? 640, 280);
          const height = Math.max(parent?.clientHeight ?? 360, 280);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }

        function render() {
          resize();
          updateCamera();
          renderer.render(scene, camera);
        }

        let dragging = false;
        let lastX = 0;
        let lastY = 0;

        function pointerDown(event: PointerEvent) {
          dragging = true;
          lastX = event.clientX;
          lastY = event.clientY;
          canvasElement.setPointerCapture(event.pointerId);
        }
        function pointerMove(event: PointerEvent) {
          if (!dragging) return;
          const dx = event.clientX - lastX;
          const dy = event.clientY - lastY;
          lastX = event.clientX;
          lastY = event.clientY;
          orbit.yaw += dx * 0.008;
          orbit.pitch = Math.max(-0.6, Math.min(0.72, orbit.pitch + dy * 0.006));
          render();
        }
        function pointerUp(event: PointerEvent) {
          dragging = false;
          try {
            canvasElement.releasePointerCapture(event.pointerId);
          } catch {
            // Browser may release capture during tab changes.
          }
        }
        function wheel(event: WheelEvent) {
          event.preventDefault();
          orbit.radius = Math.max(1.4, Math.min(6, orbit.radius + event.deltaY * 0.003));
          render();
        }

        canvasElement.addEventListener("pointerdown", pointerDown);
        canvasElement.addEventListener("pointermove", pointerMove);
        canvasElement.addEventListener("pointerup", pointerUp);
        canvasElement.addEventListener("pointercancel", pointerUp);
        canvasElement.addEventListener("wheel", wheel, { passive: false });

        const resizeObserver = new ResizeObserver(render);
        if (canvasElement.parentElement) resizeObserver.observe(canvasElement.parentElement);

        let animation = 0;
        function animateRotation() {
          if (disposed || reducedMotion || !rotationEnabledRef.current) return;
          orbit.yaw += 0.002;
          render();
          animation = window.requestAnimationFrame(animateRotation);
        }

        controlsRef.current = {
          rotate(delta) {
            orbit.yaw += delta;
            render();
          },
          zoom(delta) {
            orbit.radius = Math.max(1.4, Math.min(6, orbit.radius + delta));
            render();
          },
          fit() {
            orbit.yaw = -0.46;
            orbit.pitch = 0.24;
            orbit.radius = 3.2;
            render();
          },
          selectStructure(label) {
            applyHighlight(label);
          },
          setRotationEnabled(enabled) {
            rotationEnabledRef.current = enabled;
            window.cancelAnimationFrame(animation);
            if (enabled && !reducedMotion) animation = window.requestAnimationFrame(animateRotation);
            else render();
          },
        };

        render();
        if (rotationEnabledRef.current && !reducedMotion) animation = window.requestAnimationFrame(animateRotation);
        setRendererState("ready");

        cleanup = () => {
          window.cancelAnimationFrame(animation);
          resizeObserver.disconnect();
          canvasElement.removeEventListener("pointerdown", pointerDown);
          canvasElement.removeEventListener("pointermove", pointerMove);
          canvasElement.removeEventListener("pointerup", pointerUp);
          canvasElement.removeEventListener("pointercancel", pointerUp);
          canvasElement.removeEventListener("wheel", wheel);
          controlsRef.current = null;
          renderer.dispose();
          bufferGeometry.dispose();
          materials.forEach((material) => material.dispose());
        };
      } catch {
        if (!disposed) setRendererState("failed");
      }
    }

    void boot();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [geometry]);

  useEffect(() => {
    if (rendererState === "ready") controlsRef.current?.selectStructure(selectedStructure ?? null);
  }, [selectedStructure, rendererState]);

  function toggleStructure(label: string) {
    const next = selectedStructure === label ? null : label;
    if (isControlled) onSelectStructure?.(next);
    else setInternalSelectedStructure(next);
  }

  function toggleRotation() {
    const next = !rotationEnabled;
    rotationEnabledRef.current = next;
    setRotationEnabled(next);
    controlsRef.current?.setRotationEnabled(next);
  }

  if (viewModel.state !== "available" || !geometry) {
    return (
      <div className="spine-preview experimental-proxy-blocked" aria-live="polite">
        <strong>{viewModel.title}</strong>
        <p>{viewModel.description}</p>
        {viewModel.warnings.length > 0 && (
          <ul className="experimental-proxy-warnings">
            {viewModel.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
        {viewModel.state === "asset_error" && (
          <div className="experimental-proxy-error-actions">
            {viewModel.retryable && onRetry && (
              <button className="ghost-button" onClick={onRetry} type="button">Reintentar</button>
            )}
            {viewModel.traceId && <span className="trace-id-pill">traceId: {viewModel.traceId}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="spine-preview experimental-proxy-preview">
      <div className="viewer-controls three-d-controls">
        <button className="ghost-button" onClick={() => controlsRef.current?.zoom(-0.3)} type="button">Acercar</button>
        <button className="ghost-button" onClick={() => controlsRef.current?.zoom(0.3)} type="button">Alejar</button>
        <button className="ghost-button" onClick={() => controlsRef.current?.rotate(-0.42)} type="button">Rotar</button>
        <button className={rotationEnabled ? "primary-button" : "ghost-button"} onClick={toggleRotation} type="button" aria-pressed={rotationEnabled}>{rotationEnabled ? "Pausar rotación" : "Activar rotación"}</button>
        <button className="ghost-button" onClick={() => controlsRef.current?.fit()} type="button">Ajustar</button>
        <span className="surface-mode-pill">Proxy geométrico experimental</span>
      </div>

      <div className="experimental-proxy-canvas-wrap">
        <canvas
          aria-label="Proxy geométrico experimental. No representa una reconstrucción anatómica ni volumétrica."
          className="experimental-proxy-canvas"
          ref={canvasRef}
          role="img"
        />
        {rendererState !== "ready" && (
          <div className="three-d-loading-state" aria-live="polite">
            {rendererState === "failed" ? "No se pudo cargar el proxy 3D." : "Cargando proxy 3D..."}
          </div>
        )}
        <div className="experimental-proxy-label">{viewModel.description}</div>
        {geometry.structures.length > 0 && (
          <div className="spine-level-labels" aria-label="Estructuras del proxy experimental">
            {geometry.structures.map((structure) => (
              <button
                aria-current={selectedStructure === structure.label ? "true" : undefined}
                aria-pressed={selectedStructure === structure.label}
                className={selectedStructure === structure.label ? "active" : ""}
                key={structure.label}
                onClick={() => toggleStructure(structure.label)}
                title={`${structure.label}: estructura del proxy experimental, no anatomía validada`}
                type="button"
              >
                {structure.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className="three-d-disabled-panel">
        <div>
          <strong>{viewModel.title}</strong>
        </div>
        {viewModel.warnings.length > 0 && (
          <ul>
            {viewModel.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
        <span className="three-d-mode-b-state">
          mappingSource: {viewModel.traceSummary.mappingSource ?? "no informado"} · mappingValidated: {String(viewModel.traceSummary.mappingValidated ?? false)}
        </span>
      </section>
    </div>
  );
}
