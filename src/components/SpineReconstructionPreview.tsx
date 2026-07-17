import { useEffect, useRef, useState } from "react";

type ThreeDContract = {
  enabled?: boolean;
  status?: string;
  requiredInputs?: string[];
};

type Props = {
  threeD?: ThreeDContract | null;
};

const defaultRequiredInputs = ["sagittal_masks", "axial_masks", "spacing", "slice_index_mapping"];

function cssToken(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function requiredInputsFrom(threeD?: ThreeDContract | null) {
  return Array.isArray(threeD?.requiredInputs) && threeD.requiredInputs.length ? threeD.requiredInputs : defaultRequiredInputs;
}

export function SpineReconstructionPreview({ threeD }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controlsRef = useRef<{ rotate: (delta: number) => void; zoom: (delta: number) => void; fit: () => void } | null>(null);
  const [rendererState, setRendererState] = useState<"loading" | "ready" | "failed">("loading");
  const threeDEnabled = threeD?.enabled === true;
  const threeDStatus = threeD?.status ?? "disabled_waiting_for_volumetric_pipeline";
  const requiredInputs = requiredInputsFrom(threeD);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let cleanup = () => undefined as void;

    async function boot() {
      setRendererState("loading");
      try {
        const THREE = await import("three");
        if (disposed) return;

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        const target = new THREE.Vector3(0, -0.25, 0);
        const orbit = { yaw: -0.46, pitch: 0.2, radius: 6.6 };

        const surface = cssToken("--surface", "white");
        const border = cssToken("--border", "lightgray");
        const primary = cssToken("--primary", "royalblue");
        const ai = cssToken("--ai", "mediumpurple");
        const teal = cssToken("--teal", "teal");
        const warning = cssToken("--warning", "orange");

        scene.add(new THREE.HemisphereLight(surface, border, 2.4));
        const keyLight = new THREE.DirectionalLight(surface, 2.8);
        keyLight.position.set(4, 5, 6);
        scene.add(keyLight);
        const rimLight = new THREE.DirectionalLight(primary, 1.1);
        rimLight.position.set(-3, 2, -4);
        scene.add(rimLight);

        const spine = new THREE.Group();
        spine.name = "Generic lumbar spine atlas";
        scene.add(spine);

        const vertebraMaterial = new THREE.MeshStandardMaterial({ color: surface, roughness: 0.54, metalness: 0.02 });
        const discMaterial = new THREE.MeshStandardMaterial({ color: teal, roughness: 0.66, transparent: true, opacity: 0.78 });
        const processMaterial = new THREE.MeshStandardMaterial({ color: border, roughness: 0.64 });
        const sacrumMaterial = new THREE.MeshStandardMaterial({ color: warning, roughness: 0.6, transparent: true, opacity: 0.82 });

        const levels = ["L1", "L2", "L3", "L4", "L5", "S1"];
        levels.forEach((level, index) => {
          const y = 1.75 - index * 0.58;
          const width = 0.82 + index * 0.035;
          const body = new THREE.Mesh(new THREE.CylinderGeometry(width, width * 0.94, 0.28, 36), level === "S1" ? sacrumMaterial : vertebraMaterial);
          body.scale.set(1.12, 1, 0.58);
          body.rotation.z = (index - 2) * 0.025;
          body.position.set(Math.sin(index * 0.42) * 0.08, y, 0);
          body.castShadow = false;
          spine.add(body);

          const arch = new THREE.Mesh(new THREE.TorusGeometry(width * 0.56, 0.035, 8, 32, Math.PI), processMaterial);
          arch.position.set(body.position.x, y - 0.03, -0.45);
          arch.rotation.set(Math.PI / 2, 0, Math.PI);
          spine.add(arch);

          const process = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 20), processMaterial);
          process.position.set(body.position.x, y - 0.03, -0.82);
          process.rotation.x = Math.PI / 2;
          spine.add(process);

          if (index < levels.length - 1) {
            const disc = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.9, width * 0.86, 0.16, 36), discMaterial);
            disc.scale.set(1.08, 1, 0.55);
            disc.position.set(body.position.x + 0.02, y - 0.3, 0.01);
            spine.add(disc);
          }
        });

        const axisMaterial = new THREE.LineBasicMaterial({ color: ai, transparent: true, opacity: 0.44 });
        const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.0, -0.92), new THREE.Vector3(0, -1.28, -0.92)]), axisMaterial);
        spine.add(axis);

        function updateCamera() {
          const x = Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius;
          const y = target.y + Math.sin(orbit.pitch) * orbit.radius;
          const z = Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius;
          camera.position.set(x, y, z);
          camera.lookAt(target);
        }

        function resize() {
          const parent = canvas.parentElement;
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
          canvas.setPointerCapture(event.pointerId);
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
            canvas.releasePointerCapture(event.pointerId);
          } catch {
            // Browser may release capture during tab changes.
          }
        }

        function wheel(event: WheelEvent) {
          event.preventDefault();
          orbit.radius = Math.max(4.2, Math.min(9.2, orbit.radius + event.deltaY * 0.006));
          render();
        }

        canvas.addEventListener("pointerdown", pointerDown);
        canvas.addEventListener("pointermove", pointerMove);
        canvas.addEventListener("pointerup", pointerUp);
        canvas.addEventListener("pointercancel", pointerUp);
        canvas.addEventListener("wheel", wheel, { passive: false });

        const resizeObserver = new ResizeObserver(render);
        if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);

        let animation = 0;
        function gentleIntro() {
          if (disposed || reducedMotion) return;
          orbit.yaw += 0.002;
          render();
          animation = window.requestAnimationFrame(gentleIntro);
        }

        controlsRef.current = {
          rotate(delta) {
            orbit.yaw += delta;
            render();
          },
          zoom(delta) {
            orbit.radius = Math.max(4.2, Math.min(9.2, orbit.radius + delta));
            render();
          },
          fit() {
            orbit.yaw = -0.46;
            orbit.pitch = 0.2;
            orbit.radius = 6.6;
            render();
          },
        };

        render();
        if (!reducedMotion) animation = window.requestAnimationFrame(gentleIntro);
        setRendererState("ready");

        cleanup = () => {
          window.cancelAnimationFrame(animation);
          resizeObserver.disconnect();
          canvas.removeEventListener("pointerdown", pointerDown);
          canvas.removeEventListener("pointermove", pointerMove);
          canvas.removeEventListener("pointerup", pointerUp);
          canvas.removeEventListener("pointercancel", pointerUp);
          canvas.removeEventListener("wheel", wheel);
          controlsRef.current = null;
          renderer.dispose();
          scene.traverse((object) => {
            const mesh = object as { geometry?: { dispose: () => void }; material?: { dispose?: () => void } | Array<{ dispose?: () => void }> };
            mesh.geometry?.dispose();
            if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose?.());
            else mesh.material?.dispose?.();
          });
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
  }, []);

  return (
    <div className="spine-preview generic-spine-preview">
      <div className="viewer-controls three-d-controls">
        <button onClick={() => controlsRef.current?.zoom(-0.6)} type="button">Zoom In</button>
        <button onClick={() => controlsRef.current?.zoom(0.6)} type="button">Zoom Out</button>
        <button onClick={() => controlsRef.current?.rotate(-0.42)} type="button">Rotate</button>
        <button onClick={() => controlsRef.current?.fit()} type="button">Fit</button>
        <span className="surface-mode-pill">Surface atlas</span>
      </div>

      <div className="generic-spine-canvas-wrap">
        <canvas
          aria-label="Interactive generic lumbar spine reference atlas. Not patient-specific."
          className="generic-spine-canvas"
          ref={canvasRef}
          role="img"
        />
        {rendererState !== "ready" && (
          <div className="three-d-loading-state" aria-live="polite">
            {rendererState === "failed" ? "No se pudo cargar el atlas 3D generico." : "Cargando atlas 3D generico..."}
          </div>
        )}
        <div className="generic-spine-label">Representacion anatomica de referencia - no paciente-especifico</div>
        <div className="spine-level-labels" aria-hidden="true">
          {["L1", "L2", "L3", "L4", "L5", "S1"].map((level) => <span key={level}>{level}</span>)}
        </div>
      </div>

      <section className="three-d-disabled-panel">
        <div>
          <strong>Reconstruccion volumetrica paciente-especifica deshabilitada</strong>
          <span>Status: {threeDStatus}</span>
        </div>
        <p>Requiere pipeline volumetrico nuevo con stack, spacing, orientacion y mascaras 3D. No se simula progreso ni resultado paciente-especifico.</p>
        <ul>
          {requiredInputs.map((input) => <li key={input}>{input}</li>)}
        </ul>
        <span className="three-d-mode-b-state">threeD.enabled: {threeDEnabled ? "true" : "false"}</span>
      </section>
    </div>
  );
}
