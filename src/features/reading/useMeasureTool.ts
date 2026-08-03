import { useCallback, useEffect, useState } from "react";
import type { AnnotationPoint } from "./annotations";
import { POINTS_REQUIRED, type MeasurementKind } from "./measurements";

/**
 * La herramienta de medición activa y la figura a medio trazar.
 *
 * Cada tipo necesita una cantidad distinta de clics, así que el visor no puede
 * preguntar "¿estoy midiendo?" y asumir dos puntos: eso es exactamente lo que había
 * antes, un booleano que solo servía para distancias. Acá cada tipo declara cuántos
 * puntos pide y el estado se cierra solo cuando los tiene.
 *
 * El ROI es la excepción y se declara como tal: se traza arrastrando, así que no
 * termina por cantidad de clics sino cuando el médico suelta.
 */

export type MeasureToolState = {
  tool: MeasurementKind | null;
  points: AnnotationPoint[];
};

export type UseMeasureTool = {
  tool: MeasurementKind | null;
  points: AnnotationPoint[];
  /** Elegir la misma herramienta que ya está activa la apaga. */
  select: (tool: MeasurementKind | null) => void;
  /** Suma un punto; devuelve la figura completa cuando se cerró, o null. */
  addPoint: (point: AnnotationPoint) => { kind: MeasurementKind; points: AnnotationPoint[] } | null;
  /** Cierra un trazo libre con los puntos que tenga, si alcanzan para una figura. */
  closeFreehand: (points: AnnotationPoint[]) => { kind: MeasurementKind; points: AnnotationPoint[] } | null;
  cancel: () => void;
};

export function useMeasureTool(onCancelled?: () => void): UseMeasureTool {
  const [state, setState] = useState<MeasureToolState>({ tool: null, points: [] });

  const cancel = useCallback(() => {
    setState({ tool: null, points: [] });
    onCancelled?.();
  }, [onCancelled]);

  /*
   * Escape cancela desde cualquier parte de la pantalla, no solo con el foco sobre la
   * imagen: quedar atrapado a mitad de un ángulo, sin saber cómo salir, es la forma
   * más rápida de que una herramienta se sienta rota.
   */
  useEffect(() => {
    if (!state.tool) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel, state.tool]);

  const select = useCallback((tool: MeasurementKind | null) => {
    setState((current) => ({ tool: current.tool === tool ? null : tool, points: [] }));
  }, []);

  const addPoint = useCallback((point: AnnotationPoint) => {
    let completed: { kind: MeasurementKind; points: AnnotationPoint[] } | null = null;
    setState((current) => {
      if (!current.tool) return current;
      const required = POINTS_REQUIRED[current.tool];
      const points = [...current.points, point];
      if (required > 0 && points.length >= required) {
        completed = { kind: current.tool, points };
        // La herramienta queda activa: medir un nivel y seguir con el de al lado es
        // el gesto normal de una lectura, y obligar a re-elegirla cada vez la vuelve
        // incómoda justo cuando más se usa.
        return { tool: current.tool, points: [] };
      }
      return { ...current, points };
    });
    return completed;
  }, []);

  const closeFreehand = useCallback((points: AnnotationPoint[]) => {
    let completed: { kind: MeasurementKind; points: AnnotationPoint[] } | null = null;
    setState((current) => {
      if (current.tool !== "roi" || points.length < 3) return { ...current, points: [] };
      completed = { kind: "roi", points };
      return { tool: current.tool, points: [] };
    });
    return completed;
  }, []);

  return { tool: state.tool, points: state.points, select, addPoint, closeFreehand, cancel };
}

/** Atajos de teclado de la barra, uno por herramienta. */
export const TOOL_SHORTCUTS: Record<string, MeasurementKind> = {
  d: "distance",
  a: "angle",
  l: "listhesis",
  r: "roi",
  p: "probe",
};

export const TOOL_LABELS: Record<MeasurementKind, { name: string; hint: string }> = {
  distance: { name: "Distancia", hint: "Dos clics definen una distancia (D)" },
  angle: { name: "Ángulo", hint: "Cuatro clics: dos rectas cuyo ángulo se informa (A)" },
  listhesis: { name: "Listesis", hint: "Platillo de la vértebra inferior —anterior y posterior— y esquina posterior de la que se deslizó (L)" },
  roi: { name: "ROI", hint: "Arrastrar para trazar una región: área e intensidad (R)" },
  probe: { name: "Sonda", hint: "Un clic devuelve la intensidad original del píxel (P)" },
};
