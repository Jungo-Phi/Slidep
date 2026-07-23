import React, { useRef, useEffect, useCallback, forwardRef } from "react";
import {
  Action,
  ActionBundleType,
  ChangeDimensionActionType,
  AppMode,
  CanvasEvent,
  CanvasState,
  ConstraintElement,
  HoveredPart,
  ID,
  Mechanism,
  Point2,
  PropertiesPanelTab,
  UnionElement,
  ViewportChange,
  ZERO,
} from "../../types";
import { world2screen, screen2world, legible_id } from "../../utils";
import {
  COLORS,
  CONSTRAINT_REVEAL_COOLDOWN_MS,
  CONSTRAINT_REVEAL_FADE_MS,
  DIM,
  HIT_TOLERANCE,
} from "../../constants/rendering-specs";
import { Box, Tooltip } from "@mui/material";
import type { Instance as PopperInstance } from "@popperjs/core";
import { drawMechanicalCanvas as draw_mechanical_canvas } from "./draw-canvas";
import { canvasStateReducer } from "./canvas-state-reducer";
import { get_element_from_id } from "../mechanism/connect-actions";
import { is_zero_load, load_value_anchor } from "../../utils/load-geom";
import { get_hovered_part } from "./get-hover";
import { clamp_to_bounds } from "./hover-bounds";
import { snap_load_hover } from "./load-snap";
import { compute_visible_constraints, connected_constraints } from "./utils";
import { eraser_cursor } from "./cursors";
import { OnCanvasValueEditor } from "./OnCanvasValueEditor";
import { ProbeMetricSelector } from "./ProbeMetricSelector";
import {
  draw_grid,
  draw_trajectory,
  TrajectoryDisplay,
} from "./drawing-functions";

function mergeRefs<T>(...refs: React.Ref<T>[]) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    });
  };
}

// Keys that place or delete structural elements → exit simulation to edition
const STRUCTURAL_KEYS = new Set([
  "a",
  "b",
  "c",
  "f",
  "g",
  "j",
  "k",
  "m",
  "o",
  "p",
  "r",
  "s",
  "t",
  "u",
  "w",
  "Delete",
]);
// Keys that place constraints/dimensions → pause simulation
const CONSTRAINT_KEYS = new Set(["d", "e", "h", "l", "n", "q", "v"]);

/** One line per distinct failure: the loop retries every frame, so an unguarded
 *  log buries the console sixty times a second. */
const reportedRenderFailures = new Set<string>();
function report_render_failure(error: unknown): void {
  const key = error instanceof Error ? error.message : String(error);
  if (reportedRenderFailures.has(key)) return;
  reportedRenderFailures.add(key);
  console.error("Rendu du canvas interrompu :", error);
}

/**
 * Demande de retour visuel après un undo/redo touchant des contraintes-icônes :
 * les `revealIDs` sont révélées (recréation ou déplacement/édition), les
 * `removed` sont affichées en fantôme rouge qui s'estompe. `seq` est un compteur
 * monotone pour ne traiter chaque signal qu'une fois.
 */
export interface ConstraintChangeSignal {
  revealIDs: ID[];
  removed: ConstraintElement[];
  seq: number;
}

interface MechanicalCanvasProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  changeViewport: (viewportChange: ViewportChange) => void;
  mechanism: Mechanism;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  hoveredPart: HoveredPart;
  undoMechanism: () => void;
  redoMechanism: () => void;
  appMode: AppMode;
  activeTab: PropertiesPanelTab;
  constraintChangeRef: React.MutableRefObject<ConstraintChangeSignal | null>;
  onSpaceKey: () => void;
  onEscapeKey: () => void;
  onExitToEdition: () => void;
  onPauseSim: () => void;
  onSimulationGrab: (key: string, target: Point2, bodyRatio?: number) => void;
  onSimulationGrabEnd: () => void;
  snapToGrid: boolean;
  showGrid: boolean;
  /** Recorded trajectories of the probed elements (empty outside simulation). */
  trajectories: TrajectoryDisplay[];
}

export const MechanicalCanvas = forwardRef<
  HTMLCanvasElement,
  MechanicalCanvasProps
>(
  (
    {
      setCanvasState,
      canvasState,
      applyActions,
      changeViewport,
      mechanism,
      setHoveredPart,
      hoveredPart,
      undoMechanism,
      redoMechanism,
      appMode,
      activeTab,
      constraintChangeRef,
      onSpaceKey,
      onEscapeKey,
      onExitToEdition,
      onPauseSim,
      onSimulationGrab,
      onSimulationGrabEnd,
      snapToGrid,
      showGrid,
      trajectories,
    },
    ref,
  ) => {
    const canvasOffsetRef = useRef(ZERO);
    // Cached container geometry. Reading it back from the DOM forces a layout,
    // which neither the render loop nor a pointer move can afford to pay for.
    const canvasRectRef = useRef<{
      left: number;
      top: number;
      width: number;
      height: number;
    } | null>(null);
    const mousePositionRef = useRef(ZERO);
    const oldPositionRef = useRef(ZERO);
    const pendingPanRef = useRef<Point2>(ZERO);
    const pendingZoomRef = useRef<{ deltaY: number; center: Point2 } | null>(
      null,
    );
    const mouseButtonDownRef = useRef<"none" | "left" | "right">("none");
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const mechanismRef = useRef(mechanism);
    const hoveredPartRef = useRef(hoveredPart);
    const canvasStateRef = useRef(canvasState);
    const onSpaceKeyRef = useRef(onSpaceKey);
    onSpaceKeyRef.current = onSpaceKey;
    const onEscapeKeyRef = useRef(onEscapeKey);
    onEscapeKeyRef.current = onEscapeKey;
    const onExitToEditionRef = useRef(onExitToEdition);
    onExitToEditionRef.current = onExitToEdition;
    const onPauseSimRef = useRef(onPauseSim);
    onPauseSimRef.current = onPauseSim;
    const onSimulationGrabRef = useRef(onSimulationGrab);
    onSimulationGrabRef.current = onSimulationGrab;
    const onSimulationGrabEndRef = useRef(onSimulationGrabEnd);
    onSimulationGrabEndRef.current = onSimulationGrabEnd;
    const appModeRef = useRef(appMode);
    appModeRef.current = appMode;
    const trajectoriesRef = useRef(trajectories);
    trajectoriesRef.current = trajectories;
    const activeTabRef = useRef(activeTab);
    activeTabRef.current = activeTab;
    // Contrainte révélée au survol → timestamp du dernier survol (hover-reveal).
    const revealMapRef = useRef<Map<ID, number>>(new Map());
    // Fantômes des contraintes supprimées par undo/redo (objet + timestamp).
    const ghostListRef = useRef<
      Array<{ constraint: ConstraintElement; timestamp: number }>
    >([]);
    const lastConstraintChangeSeqRef = useRef(0);
    // Renvoie vers le handleEvent courant : onMouseUpHandler est capturé dans le
    // handleEvent mémoïsé, il doit rester stable sans figer la closure.
    const handleEventRef = useRef<(event: CanvasEvent) => void>(() => {});

    mechanismRef.current = mechanism;
    hoveredPartRef.current = hoveredPart;
    canvasStateRef.current = canvasState;

    /** Re-reads the container geometry. Call it whenever the canvas may have
     *  moved or been resized — the cache serves every frame in between. */
    const measureCanvas = useCallback(() => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      // The backing store is integral: keep the cached size in step with it, so
      // the screen↔world conversions don't drift by a fraction of a pixel.
      const measured = {
        left: rect.left,
        top: rect.top,
        width: Math.trunc(rect.width),
        height: Math.trunc(rect.height),
      };
      canvasRectRef.current = measured;
      canvasOffsetRef.current = new Point2(rect.left, rect.top);
      return measured;
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      measureCanvas();
      const observer = new ResizeObserver(() => measureCanvas());
      observer.observe(container);
      return () => observer.disconnect();
    }, [measureCanvas]);

    // Rafraîchit les contraintes révélées d'après l'élément (ou le badge) survolé.
    // Appelé à chaque frame → les badges restent affichés tant qu'on survole,
    // même sans bouger la souris.
    const refreshRevealFromHover = useCallback((hovered: HoveredPart) => {
      if (appModeRef.current !== "edition") return;
      const now = performance.now();
      if (
        hovered.type === "Node" ||
        hovered.type === "Edge" ||
        hovered.type === "GearTooth" ||
        hovered.type === "BeltBody"
      ) {
        for (const id of connected_constraints(
          hovered.id,
          mechanismRef.current.constraintElements,
        ))
          revealMapRef.current.set(id, now);
      } else if (hovered.type === "Constraint") {
        revealMapRef.current.set(hovered.id, now);
      }
    }, []);

    // Map des contraintes visibles (id → opacité 0–1) pour dessin + hit-testing.
    const computeVisibleConstraints = useCallback((): Map<ID, number> => {
      refreshRevealFromHover(hoveredPartRef.current);
      const now = performance.now();
      const revealedOpacities = new Map<ID, number>();
      for (const [id, ts] of revealMapRef.current) {
        const age = now - ts;
        if (age >= CONSTRAINT_REVEAL_COOLDOWN_MS) {
          revealMapRef.current.delete(id);
          continue;
        }
        // Pleine opacité, puis fondu sur les derniers CONSTRAINT_REVEAL_FADE_MS.
        revealedOpacities.set(
          id,
          Math.min(
            1,
            (CONSTRAINT_REVEAL_COOLDOWN_MS - age) / CONSTRAINT_REVEAL_FADE_MS,
          ),
        );
      }
      return compute_visible_constraints(
        mechanismRef.current.constraintElements,
        appModeRef.current,
        activeTabRef.current,
        revealedOpacities,
        canvasStateRef.current,
      );
    }, [refreshRevealFromHover]);

    // Traite un éventuel signal d'undo/redo : révèle les contraintes recréées et
    // ajoute les supprimées à la liste des fantômes. N'agit qu'une fois par seq.
    const processConstraintChange = useCallback(() => {
      const change = constraintChangeRef.current;
      if (!change || change.seq === lastConstraintChangeSeqRef.current) return;
      lastConstraintChangeSeqRef.current = change.seq;
      const now = performance.now();
      const revealSet = new Set(change.revealIDs);
      for (const id of change.revealIDs) revealMapRef.current.set(id, now);
      // Une contrainte recréée annule son fantôme éventuel.
      ghostListRef.current = ghostListRef.current.filter(
        (g) => !revealSet.has(g.constraint.id),
      );
      for (const constraint of change.removed) {
        revealMapRef.current.delete(constraint.id);
        ghostListRef.current.push({ constraint, timestamp: now });
      }
    }, [constraintChangeRef]);

    const render = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Writing width/height reallocates the backing store even when the value
      // is unchanged, so the canvas only follows the container when it moves.
      const rect = canvasRectRef.current ?? measureCanvas();
      if (!rect) return;
      if (canvas.width !== rect.width) canvas.width = rect.width;
      if (canvas.height !== rect.height) canvas.height = rect.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (showGrid)
        draw_grid(
          ctx,
          canvas.width,
          canvas.height,
          mechanismRef.current.viewport,
        );

      // Draw axes
      ctx.strokeStyle = COLORS.GRID_AXIS;
      // Vertical axis
      const panX = mechanismRef.current.viewport.pan.x;
      ctx.beginPath();
      ctx.moveTo(panX, 0);
      ctx.lineTo(panX, canvas.height);
      ctx.stroke();
      // Horizontal axis
      const panY = mechanismRef.current.viewport.pan.y;
      ctx.beginPath();
      ctx.moveTo(0, panY);
      ctx.lineTo(canvas.width, panY);
      ctx.stroke();

      // DEBUG
      let text = `${hoveredPartRef.current.position.toString()} ${hoveredPartRef.current.type}`;
      if ("part" in hoveredPartRef.current) {
        text += ` ${hoveredPartRef.current.part}`;
      }
      ctx.fillText(text, 125, 40);

      text = `${canvasStateRef.current.type.toString()}`;
      if ("elementID" in canvasStateRef.current) {
        text += ` ${legible_id(canvasStateRef.current.elementID)}`;
      }
      ctx.fillText(text, 275, 40);

      ctx.save();
      ctx.translate(
        mechanismRef.current.viewport.pan.x,
        mechanismRef.current.viewport.pan.y,
      );
      ctx.scale(
        mechanismRef.current.viewport.zoom,
        mechanismRef.current.viewport.zoom,
      );

      // Trajectoires des points sondés, sous les éléments du mécanisme.
      for (const traj of trajectoriesRef.current)
        draw_trajectory(ctx, traj.points, traj.headCount, traj.color);

      // Retour visuel undo/redo : révèle les recréations, prépare les fantômes.
      processConstraintChange();
      const visibleConstraints = computeVisibleConstraints();

      const now = performance.now();
      const modelConstraints = mechanismRef.current.constraintElements;
      const modelIDs = new Set(modelConstraints.map((c) => c.id));
      const ghostIDs = new Set<ID>();
      const ghostConstraints: ConstraintElement[] = [];
      ghostListRef.current = ghostListRef.current.filter((g) => {
        const age = now - g.timestamp;
        if (age >= CONSTRAINT_REVEAL_COOLDOWN_MS) return false;
        // Si la contrainte a été recréée entretemps, son fantôme est inutile.
        if (modelIDs.has(g.constraint.id)) return false;
        const opacity = Math.min(
          1,
          (CONSTRAINT_REVEAL_COOLDOWN_MS - age) / CONSTRAINT_REVEAL_FADE_MS,
        );
        visibleConstraints.set(g.constraint.id, opacity);
        ghostIDs.add(g.constraint.id);
        ghostConstraints.push(g.constraint);
        return true;
      });

      draw_mechanical_canvas(
        ctx,
        hoveredPartRef.current,
        canvasStateRef.current,
        mechanismRef.current.mechanicalElements,
        ghostConstraints.length
          ? [...modelConstraints, ...ghostConstraints]
          : modelConstraints,
        mechanismRef.current.loads,
        visibleConstraints,
        ghostIDs,
      );
      ctx.restore();
    }, [
      showGrid,
      computeVisibleConstraints,
      processConstraintChange,
      measureCanvas,
    ]);

    useEffect(() => {
      let rafId: number;
      const loop = () => {
        if (pendingPanRef.current.x !== 0 || pendingPanRef.current.y !== 0) {
          changeViewport({ type: "Pan", delta: pendingPanRef.current });
          pendingPanRef.current = ZERO;
        }
        if (pendingZoomRef.current) {
          changeViewport({
            type: "Zoom",
            deltaY: pendingZoomRef.current.deltaY,
            center: pendingZoomRef.current.center,
          });
          pendingZoomRef.current = null;
        }
        // A frame that throws must not take the loop with it: the canvas is
        // cleared before drawing, so a dead loop leaves the user staring at the
        // bare grid with no way back. Losing one frame is recoverable.
        try {
          render();
        } catch (error) {
          report_render_failure(error);
        }
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(rafId);
    }, [render, changeViewport]);

    useEffect(() => {
      // TODO : Center viewoprt on resize
      const handleResize = () => render();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [render]);

    // Logique "bouton relâché" partagée : appelée par pointerup/pointercancel
    // et par le reducer (undo/redo forcent un relâchement). Ne touche pas à la
    // capture du pointeur (gérée dans les handlers pointer qui ont l'événement).
    const onMouseUpHandler = useCallback(() => {
      handleEventRef.current({
        type: "MouseButtonUp",
      });
      mouseButtonDownRef.current = "none";
    }, []);

    const onPointerDownHandler = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ) => {
      window.getSelection()?.removeAllRanges();
      // A gesture is rare enough to pay for one measurement, and it catches the
      // case the observer cannot see: a canvas moved without being resized.
      measureCanvas();
      // Capture le pointeur : une fois le bouton enfoncé, les pointermove / pointerup continuent d'arriver sur le canvas même si le curseur sort de ses limites.
      event.currentTarget.setPointerCapture(event.pointerId);
      mousePositionRef.current = new Point2(event.clientX, event.clientY).sub(
        canvasOffsetRef.current,
      );
      if (event.button === 0) {
        mouseButtonDownRef.current = "left";
        handleEvent({
          type: "MouseLeftButtonDown",
          shiftKey: event.shiftKey,
        });
      } else if (event.button === 2) {
        mouseButtonDownRef.current = "right";
        handleEvent({
          type: "MouseRightButtonDown",
        });
      }
    };

    const onPointerMoveHandler = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvasRectRef.current ?? measureCanvas();
      if (!rect) return;

      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);
      const newPos = new Point2(x, y);

      mousePositionRef.current = newPos;

      handleEvent({
        type: "MouseMove",
        mouseDelta: new Point2(event.movementX, event.movementY),
      });
    };

    const onPointerUpHandler = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      onMouseUpHandler();
    };

    const handleEvent = useCallback(
      (event: CanvasEvent) => {
        if (
          event.type === "MouseMove" &&
          mouseButtonDownRef.current === "right"
        ) {
          pendingPanRef.current = pendingPanRef.current.add(event.mouseDelta);
          return;
        }
        if (event.type === "KeyDown" && event.key === " ") {
          onSpaceKeyRef.current();
          // En édition, Espace lance la simulation : on repart d'un canvas
          // propre. En simulation il ne fait que play/pause — garder la
          // sélection, dont l'onglet Analyse affiche les grandeurs.
          if (appModeRef.current === "edition")
            setCanvasState({ type: "Selecting" });
          return;
        }
        if (event.type === "KeyDown") {
          if (STRUCTURAL_KEYS.has(event.key)) onExitToEditionRef.current();
          else if (CONSTRAINT_KEYS.has(event.key)) onPauseSimRef.current();
        }
        if (
          event.type === "KeyDown" &&
          event.key === "Escape" &&
          canvasStateRef.current.type === "Selecting"
        ) {
          // Reset the running simulation, or exit to edition — decided in App.
          onEscapeKeyRef.current();
          setCanvasState({ type: "Selecting" });
          return;
        }
        const currMech = mechanismRef.current;

        // Bounded here, where the cursor enters the system, so that hit-testing
        // and the gestures reading the raw mouse share one bounded point.
        const worldMousePos = clamp_to_bounds(
          screen2world(mousePositionRef.current, currMech.viewport),
          canvasStateRef.current,
          currMech.mechanicalElements,
        );
        const newHoveredPart = get_hovered_part(
          currMech.mechanicalElements,
          currMech.constraintElements,
          currMech.loads,
          computeVisibleConstraints(),
          worldMousePos,
          canvasStateRef.current,
        );
        if (
          snapToGrid &&
          newHoveredPart.type === "Void" &&
          // A point held back by a refusal keeps the distance it was pushed to:
          // the grid would pull it straight back onto the centre that refused it.
          !newHoveredPart.rejected &&
          appModeRef.current === "edition" &&
          (canvasStateRef.current.type === "ChangingGearRadius" ||
            canvasStateRef.current.type === "MovingEdgeStartPoint" ||
            canvasStateRef.current.type === "MovingEdgeEndPoint" ||
            canvasStateRef.current.type === "MovingNode" ||
            canvasStateRef.current.type === "PlacingBeamStart" ||
            canvasStateRef.current.type === "PlacingBeamEnd" ||
            canvasStateRef.current.type === "PlacingBeltStart" ||
            canvasStateRef.current.type === "PlacingBeltEnd" ||
            canvasStateRef.current.type === "PlacingSpringStart" ||
            canvasStateRef.current.type === "PlacingSpringEnd" ||
            canvasStateRef.current.type === "PlacingDamperStart" ||
            canvasStateRef.current.type === "PlacingDamperEnd" ||
            canvasStateRef.current.type === "PlacingGearStart" ||
            canvasStateRef.current.type === "PlacingGearRadius" ||
            canvasStateRef.current.type === "PlacingGround" ||
            canvasStateRef.current.type === "PlacingJoin" ||
            canvasStateRef.current.type === "PlacingMass" ||
            canvasStateRef.current.type === "PlacingMotor" ||
            canvasStateRef.current.type === "PlacingPivot" ||
            canvasStateRef.current.type === "PlacingSlider")
        ) {
          const rdx =
            Math.round(newHoveredPart.position.x / DIM.GRID_MAJOR) *
            DIM.GRID_MAJOR;
          if (
            Math.abs(rdx - newHoveredPart.position.x) <
            HIT_TOLERANCE.SNAP_TO_GRID / currMech.viewport.zoom
          )
            newHoveredPart.position.x = rdx;
          const rdy =
            Math.round(newHoveredPart.position.y / DIM.GRID_MAJOR) *
            DIM.GRID_MAJOR;
          if (
            Math.abs(rdy - newHoveredPart.position.y) <
            HIT_TOLERANCE.SNAP_TO_GRID / currMech.viewport.zoom
          )
            newHoveredPart.position.y = rdy;
        }
        if (
          newHoveredPart.type === "Void" &&
          appModeRef.current === "edition"
        ) {
          // Align load direction to world/beam axes, and its length to a round value
          newHoveredPart.position = snap_load_hover(
            canvasStateRef.current,
            newHoveredPart.position,
            currMech.mechanicalElements,
            currMech.loads,
            currMech.viewport.zoom,
          );
        }
        // Both snaps above rewrite the point after it was bounded, and the grid
        // one pulls it a long way — onto the very centre of a gear being sized,
        // when that centre sits on the grid. Only the free point is restored: a
        // hovered element keeps its own position, which is what makes it a target.
        if (newHoveredPart.type === "Void")
          newHoveredPart.position = clamp_to_bounds(
            newHoveredPart.position,
            canvasStateRef.current,
            currMech.mechanicalElements,
          );
        refreshRevealFromHover(newHoveredPart);

        setHoveredPart(newHoveredPart);

        canvasStateReducer(
          canvasStateRef.current,
          newHoveredPart,
          oldPositionRef.current,
          mouseButtonDownRef.current,
          event,
          currMech.mechanicalElements,
          currMech.constraintElements,
          setCanvasState,
          applyActions,
          undoMechanism,
          redoMechanism,
          onMouseUpHandler,
          currMech.loads,
          appModeRef.current !== "edition",
          onSimulationGrabRef.current,
          onSimulationGrabEndRef.current,
          worldMousePos,
          currMech.viewport.zoom,
        );
        oldPositionRef.current = newHoveredPart.position.clone();
      },
      [
        applyActions,
        undoMechanism,
        redoMechanism,
        setCanvasState,
        setHoveredPart,
        snapToGrid,
        computeVisibleConstraints,
        refreshRevealFromHover,
        onMouseUpHandler,
      ],
    );
    handleEventRef.current = handleEvent;

    const isTypingInInput = (): boolean => {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName.toLowerCase();
      // Only text-like inputs should swallow shortcuts. A checkbox/radio/switch
      // (MUI Switch is <input type="checkbox">) or a button must NOT count as
      // "typing", otherwise Space toggles it instead of triggering play/pause.
      if (tag === "input") {
        const type = (active as HTMLInputElement).type.toLowerCase();
        const NON_TEXT = new Set([
          "checkbox",
          "radio",
          "button",
          "submit",
          "reset",
          "range",
          "color",
          "file",
        ]);
        return !NON_TEXT.has(type);
      }
      if (
        tag === "menu" ||
        tag === "dialog" ||
        tag === "textarea" ||
        tag === "select"
      )
        return true; // TODO : trouver une méthode plus fiable
      if ((active as HTMLElement).isContentEditable) return true;
      return false;
    };

    useEffect(() => {
      const handleGlobalKeyDown = (event: KeyboardEvent) => {
        if (isTypingInInput()) return;
        // The probe metric popover handles its own keys (Enter/Escape)
        if (canvasStateRef.current.type === "PlacingProbeMetrics") return;
        if (event.key === " ") {
          event.preventDefault();
          // Space must only play/pause: drop the focus a UI control kept after
          // being clicked, so Space doesn't re-activate it (button, switch…).
          (document.activeElement as HTMLElement | null)?.blur?.();
        }
        handleEvent({
          type: "KeyDown",
          key: event.key,
          ctrlKey: event.ctrlKey,
        });
      };
      document.addEventListener("keydown", handleGlobalKeyDown);
      return () => document.removeEventListener("keydown", handleGlobalKeyDown);
    }, [handleEvent]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();

        const rect = canvasRectRef.current;
        if (!rect) return;
        const center = new Point2(
          (event.clientX - rect.left) * (canvas.width / rect.width),
          (event.clientY - rect.top) * (canvas.height / rect.height),
        );

        const { deltaX, deltaY, ctrlKey, metaKey } = event;

        if (ctrlKey || metaKey) {
          if (pendingZoomRef.current) {
            pendingZoomRef.current.deltaY += deltaY;
            pendingZoomRef.current.center = center;
          } else {
            pendingZoomRef.current = {
              deltaY,
              center,
            };
          }
        } else {
          const delta = new Point2(-deltaX, -deltaY);
          pendingPanRef.current = pendingPanRef.current.add(delta);
        }
      };

      canvas.addEventListener("wheel", handleWheel, { passive: false });
      return () => canvas.removeEventListener("wheel", handleWheel);
    }, []);

    const onContextMenuHandler = (
      event: React.MouseEvent<HTMLCanvasElement>,
    ) => {
      event.preventDefault();
    };

    // Why the gesture is refused here. Anchored on the raw cursor rather than on
    // the hovered point: a refusal reports its point pushed out to the edge of
    // the hit zone, which swings across it for a one-pixel move and would send
    // the bubble jumping from one side of the cursor to the other.
    const rejection =
      hoveredPart.type === "Void" && hoveredPart.rejected
        ? { reason: hoveredPart.rejected, anchor: mousePositionRef.current }
        : null;
    // The anchor is a moving element, which Popper does not watch on its own.
    const rejectionPopperRef = useRef<PopperInstance>(null);
    useEffect(() => {
      rejectionPopperRef.current?.update();
    }, [rejection?.anchor.x, rejection?.anchor.y]);

    // A refusal outranks every tool: whatever is armed, this spot takes nothing.
    const cursor =
      hoveredPart.type === "Void" && hoveredPart.rejected
        ? "not-allowed"
        : canvasState.type === "SimulationDragging"
          ? "grabbing"
          : appMode !== "edition" &&
              ["Selecting", "SelectedElement"].includes(canvasState.type) &&
              hoveredPart.type !== "Void"
            ? "grab"
            : ["Erasing", "ErasingMultiple"].includes(canvasState.type)
              ? eraser_cursor()
              : [
                    "DimensionStart",
                    "DimensionNode",
                    "DimensionEdge",
                    "DimensionNodeToNode",
                    "DimensionEdgeToNode",
                    "DimensionAngle",
                    "DimensionRadius",
                    "DimensionBelt",
                    "HorizontalVerticalConstraintStart",
                    "HorizontalVerticalConstraintNode",
                    "NormalConstraintStart",
                    "NormalConstraintEdge",
                    "ParallelConstraintStart",
                    "ParallelConstraintEdge",
                    "EqualConstraintStart",
                    "EqualConstraintEdge",
                    "EqualConstraintGear",
                    "GearRatioConstraintStart",
                    "GearRatioConstraintGear",
                  ].includes(canvasState.type)
                ? "crosshair"
                : "default";

    // Les deux états de saisie partagent l'éditeur ; ils ne diffèrent que par
    // ce qu'ENTER et ESCAPE font en sortie (voir `onCommit` / `onCancel`).
    const isPlacingValue = canvasState.type === "PlacingValue";
    const isEditingValue = canvasState.type === "EditingValue";
    const editingElement =
      isEditingValue || isPlacingValue
        ? get_element_from_id(
            canvasState.elementID,
            mechanism.mechanicalElements,
            mechanism.constraintElements,
            mechanism.loads,
          )
        : null;

    // Commit an edited value for a load (force magnitude, moment value, or a
    // distributed force's start/end magnitude). Returns true if it handled the
    // element, false for non-load elements (dimensions/constraints).
    const commitLoadValue = (element: UnionElement, newValue: number) => {
      switch (element.type) {
        case "force":
          applyActions(
            [
              {
                type: "ChangeForce",
                id: element.id,
                newVector: element.vector.scale2length(newValue),
                oldVector: element.vector,
              },
            ],
            "MoveLoad",
          );
          return true;
        case "moment":
          applyActions(
            [
              {
                type: "ChangeMoment",
                id: element.id,
                // The editor shows the magnitude unsigned: a moment's sign is
                // its rotation direction, picked when it is placed, so editing
                // the value here resizes the arc without turning it around.
                newValue: newValue * (element.value < 0 ? -1 : 1),
                oldValue: element.value,
              },
            ],
            "MoveLoad",
          );
          return true;
        case "distributed-force": {
          const editingEnd =
            canvasState.type === "EditingValue" && canvasState.part === "end";
          // The editor opens on the magnitude: the sign of an end is which side
          // of the beam it pushes on. Committing it unchanged must therefore
          // never turn the load over, so the typed sign is read as a flip of
          // wherever that end currently points, not as the new sign itself.
          const edited =
            newValue *
            ((editingEnd ? element.magnitudeEnd : element.magnitudeStart) < 0
              ? -1
              : 1);
          applyActions(
            [
              {
                type: "ChangeDistributedForce",
                id: element.id,
                newDirection: element.direction,
                oldDirection: element.direction,
                newMagnitudeStart: editingEnd ? element.magnitudeStart : edited,
                oldMagnitudeStart: element.magnitudeStart,
                newMagnitudeEnd: editingEnd ? edited : element.magnitudeEnd,
                oldMagnitudeEnd: element.magnitudeEnd,
              },
            ],
            "MoveLoad",
          );
          return true;
        }
        default:
          return false;
      }
    };

    return (
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          position: "relative",
          // The ground the drawing sits on. It belongs to the container, not to
          // the (transparent, cleared every frame) canvas: as a theme role it
          // cross-fades with the rest of the interface on a theme change, where
          // a `COLORS` read baked into an inline style would freeze on whichever
          // palette was current when React last rendered.
          backgroundColor: "background.paper",
        }}
      >
        <canvas
          ref={mergeRefs(canvasRef, ref)}
          style={{
            width: "100%",
            height: "100%",
            cursor,
            touchAction: "none",
          }}
          onPointerDown={onPointerDownHandler}
          onPointerMove={onPointerMoveHandler}
          onPointerUp={onPointerUpHandler}
          onPointerCancel={onPointerUpHandler}
          onContextMenu={onContextMenuHandler}
          tabIndex={0}
          aria-label="Canvas de conception mécanique"
          role="img"
        />
        {rejection && (
          <Tooltip
            open
            disableInteractive
            title={rejection.reason}
            placement="bottom-start"
            slotProps={{
              popper: {
                popperRef: rejectionPopperRef,
                // Clears the cursor glyph, which the hotspot sits at the top of.
                modifiers: [{ name: "offset", options: { offset: [0, 20] } }],
                sx: { pointerEvents: "none" },
              },
            }}
          >
            <Box
              sx={{
                position: "absolute",
                left: rejection.anchor.x,
                top: rejection.anchor.y,
                width: 0,
                height: 0,
                pointerEvents: "none",
              }}
            />
          </Tooltip>
        )}
        {editingElement && (isEditingValue || isPlacingValue) && (
          <OnCanvasValueEditor
            mode={editingElement.type === "gear-ratio" ? "ratio" : "single"}
            // Loads reuse the value captured at trigger time (force magnitude,
            // moment value, or the distributed start/end magnitude); dimensions
            // and constraints carry it on the element.
            initialValue={
              editingElement.type === "moment"
                ? Math.abs(editingElement.value)
                : "value" in editingElement
                  ? editingElement.value
                  : canvasState.value
            }
            suffix={editingElement.type === "dimension-angle" ? "°" : undefined}
            // A distributed load's end is the one value here that can be
            // turned around (a minus flips it across the beam) and the one that
            // can legitimately be set to zero — as long as its opposite end is
            // still carrying something, otherwise the load would vanish.
            signed={editingElement.type === "distributed-force"}
            allowZero={
              editingElement.type === "distributed-force" &&
              !is_zero_load(
                isEditingValue && canvasState.part === "end"
                  ? editingElement.magnitudeStart
                  : editingElement.magnitudeEnd,
              )
            }
            position={world2screen(
              // Loads have no `.position`; their editable label sits at a
              // computed world anchor next to the drawn value.
              editingElement.type === "force" ||
                editingElement.type === "moment" ||
                editingElement.type === "distributed-force"
                ? load_value_anchor(
                    editingElement,
                    mechanism.mechanicalElements,
                    // Seule une charge existante est ré-éditée : un `PlacingValue`
                    // ne concerne que les cotes, qui n'ont pas de `part`.
                    isEditingValue ? canvasState.part : undefined,
                  )
                : "position" in editingElement
                  ? editingElement.position
                  : ZERO,
              mechanism.viewport,
            )}
            onCommit={(newValue) => {
              const loadCommitted = commitLoadValue(editingElement, newValue);

              if (!loadCommitted && "value" in editingElement) {
                let actionType: ChangeDimensionActionType | undefined;
                switch (editingElement.type) {
                  case "dimension-edge":
                    actionType = "ChangeDimensionEdgeValue";
                    break;
                  case "dimension-node-to-node":
                    actionType = "ChangeDimensionNodeToNodeValue";
                    break;
                  case "dimension-edge-to-node":
                    actionType = "ChangeDimensionEdgeToNodeValue";
                    break;
                  case "dimension-angle":
                    actionType = "ChangeDimensionAngleValue";
                    break;
                  case "dimension-radius":
                    actionType = "ChangeDimensionRadiusValue";
                    break;
                  case "dimension-belt":
                    actionType = "ChangeDimensionBeltValue";
                    break;
                  case "gear-ratio":
                    actionType = "ChangeGearRatioValue";
                    break;
                }
                if (actionType) {
                  applyActions(
                    [
                      {
                        type: actionType,
                        id: editingElement.id,
                        newValue: newValue,
                        oldValue: editingElement.value,
                      },
                    ],
                    "ChangeDimension",
                  );
                }
              }
              // Valider sur un élément qu'on vient de poser réarme son outil,
              // pour en enchaîner un autre sans repasser par la palette.
              if (isPlacingValue) {
                if (editingElement.type === "gear-ratio") {
                  setCanvasState({ type: "GearRatioConstraintStart" });
                } else {
                  setCanvasState({ type: "DimensionStart" });
                }
              } else {
                setCanvasState({
                  type: "SelectedElement",
                  elementID: editingElement.id,
                });
              }
            }}
            onCancel={() => {
              // Annuler la saisie d'un élément qu'on vient de poser le retire :
              // sans valeur, il n'a jamais vraiment existé.
              if (isPlacingValue) {
                applyActions(
                  [
                    {
                      type: "DeleteElement",
                      element: editingElement,
                    },
                  ],
                  "Other",
                );
                setCanvasState({ type: "Selecting" });
              } else {
                setCanvasState({
                  type: "SelectedElement",
                  elementID: editingElement.id,
                });
              }
            }}
          />
        )}
        {canvasState.type === "PlacingProbeMetrics" &&
          (() => {
            const probedElement = mechanism.mechanicalElements.find(
              (el) => el.id === canvasState.elementID,
            );
            if (!probedElement) return null;
            return (
              <ProbeMetricSelector
                element={probedElement}
                position={world2screen(
                  canvasState.position,
                  mechanism.viewport,
                )}
                onCommit={(newProbes) => {
                  const oldProbes = probedElement.probes ?? [];
                  const changed =
                    newProbes.length !== oldProbes.length ||
                    newProbes.some((p, i) => p.metric !== oldProbes[i].metric);
                  if (changed)
                    applyActions(
                      [
                        {
                          type: "SetProbes",
                          elementID: probedElement.id,
                          newProbes,
                          oldProbes,
                        },
                      ],
                      "Other",
                    );
                  setCanvasState({ type: "PlacingProbe" });
                }}
                onCancel={() => setCanvasState({ type: "PlacingProbe" })}
              />
            );
          })()}
      </Box>
    );
  },
);

export default MechanicalCanvas;
