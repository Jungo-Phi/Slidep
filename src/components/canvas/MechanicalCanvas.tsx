import React, { useRef, useEffect, useCallback, forwardRef } from "react";
import {
  Action,
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
  ScreenPoint,
  WorldPoint,
} from "../../types";
import { world2screen, screen2world } from "../../utils";
import {
  CONSTRAINT_REVEAL_COOLDOWN_MS,
  CONSTRAINT_REVEAL_FADE_MS,
  MODE_ANIMATION,
} from "../../constants/rendering-specs";
import { Box, Tooltip } from "@mui/material";
import { type Instance as PopperInstance } from "@popperjs/core";
import { CanvasHighlight, draw_mechanical_canvas } from "./draw-canvas";
import { RedundancySymbol } from "../solver/redundancy-symbols";
import { canvasStateReducer } from "./canvas-state-reducer";
import { get_element_from_id } from "../mechanism/connect-actions";
import { load_value_anchor } from "../../utils/load-geom";
import { is_zero_load } from "../../utils/load-scale";
import { t } from "../../i18n";
import { get_hovered_part } from "./get-hover";
import { clamp_to_bounds } from "./hover-bounds";
import { snap_hover } from "./point-snap";
import {
  NO_FEEDBACK,
  type SnapFeedback,
  type SnapSettings,
} from "./snap-corridor";
import { snap_dimension_position } from "./dimension-snap";
import { snap_load_hover } from "./load-snap";
import { compute_visible_constraints, connected_constraints } from "./utils";
import { eraser_cursor } from "./cursors";
import { OnCanvasValueEditor } from "./OnCanvasValueEditor";
import { OnCanvasProbeMetricSelector } from "./ProbeMetricSelector";
import {
  draw_axes,
  draw_grid,
  draw_snap_feedback,
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
  applyActions: (actions: Action[]) => void;
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
  /** May a grab be started at all? False while replaying behind the frontier. */
  canSimulationGrab: boolean;
  snapToGrid: boolean;
  snapSettings: SnapSettings;
  showGrid: boolean;
  /**
   * What the recording loop publishes each frame, or `null` outside simulation.
   *
   * A ref rather than a prop because the canvas must not wait for a render to show a
   * mechanism that moved: it draws from its own RAF loop, and the clock deliberately
   * reaches React at a fraction of the frame rate.
   */
  liveFrameRef: React.RefObject<LiveFrame | null>;
  /** Elements the analysis panel is pointing at, and why (see `CanvasHighlight`). */
  highlight: CanvasHighlight;
  /**
   * A pose the analysis panel is swinging along one motion mode, or `null`.
   *
   * A ref for the same reason as `liveFrameRef`: it changes every frame, and the draw loop
   * must not wait for a render.
   *
   * It wins over the live frame, which is only ever set in simulation and would otherwise
   * hide the swing on a PAUSED recording — the one place the feature has most to say, since
   * the analysis then describes the pose the recording is stopped on. Nothing is lost the
   * other way round: the panel only animates while the mechanism is still, so this is null
   * for the whole of a playing simulation.
   */
  modePreviewRef: React.RefObject<Mechanism | null>;
  /** How a redundant constraint the analysis panel is pointing at would yield. */
  redundancySymbols: RedundancySymbol[];
}

/** The simulated mechanism and probe trajectories at the cursor, for one frame. */
export interface LiveFrame {
  mechanism: Mechanism;
  trajectories: TrajectoryDisplay[];
}

const EMPTY_TRAJECTORIES: TrajectoryDisplay[] = [];

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
      canSimulationGrab,
      snapToGrid,
      snapSettings,
      showGrid,
      liveFrameRef,
      highlight,
      modePreviewRef,
      redundancySymbols,
    },
    ref,
  ) => {
    // Cached container geometry. Reading it back from the DOM forces a layout,
    // which neither the render loop nor a pointer move can afford to pay for.
    const canvasRectRef = useRef<{
      left: number;
      top: number;
      width: number;
      height: number;
    } | null>(null);
    const canvasOffsetRef = useRef<ScreenPoint>(ZERO);
    const mousePositionRef = useRef<ScreenPoint>(ZERO);
    const oldPositionRef = useRef<WorldPoint>(ZERO);
    const pendingPanRef = useRef<ScreenPoint>(ZERO);
    const pendingZoomRef = useRef<{
      deltaY: number;
      center: ScreenPoint;
    } | null>(null);
    const mouseButtonDownRef = useRef<"none" | "left" | "right">("none");
    // The hovered part is shared with the panels, which designate an element by
    // hovering its card. Only a hover pointed at on the canvas carries a cursor
    // for a tool to preview under.
    const cursorOnCanvasRef = useRef(false);
    // Set beside every `setHoveredPart`: the guide belongs to the snap that
    // produced the hovered point, and would be a lie recomputed from it.
    const snapFeedbackRef = useRef<SnapFeedback>(NO_FEEDBACK);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const mechanismRef = useRef(mechanism);
    const restingRef = useRef(mechanism);
    /** How much of their opacity the dimensions currently keep, 0…1 (see the fade below). */
    const dimensionFadeRef = useRef(1);
    const lastFadeAtRef = useRef(0);
    /** When a mode was last being swung, for the delay before dimensions come back. */
    const lastSwingAtRef = useRef(0);
    const hoveredPartRef = useRef(hoveredPart);
    const canvasStateRef = useRef(canvasState);
    const highlightRef = useRef(highlight);
    highlightRef.current = highlight;
    const redundancySymbolsRef = useRef(redundancySymbols);
    redundancySymbolsRef.current = redundancySymbols;
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
    const canSimulationGrabRef = useRef(canSimulationGrab);
    canSimulationGrabRef.current = canSimulationGrab;
    const appModeRef = useRef(appMode);
    appModeRef.current = appMode;
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

    // The live frame wins: a render must not put the edit-time positions back under the
    // pointer for the frame it takes the draw loop to overwrite them again.
    // What is drawn when nothing overrides it. `render` runs from the draw loop and does
    // not list the prop among its dependencies, so it reads the resting pose from here
    // rather than from a closure that would freeze on the first frame.
    restingRef.current = mechanism;
    mechanismRef.current =
      modePreviewRef.current ?? liveFrameRef.current?.mechanism ?? mechanism;
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

      // The simulated positions — and the pose a mode is being swung through — land here,
      // not through a prop: hit-testing and hover read the same ref, so they stay on the
      // mechanism that is actually drawn. Both change every frame, which no render follows.
      const live = liveFrameRef.current;
      mechanismRef.current =
        modePreviewRef.current ?? live?.mechanism ?? restingRef.current;

      // Writing width/height reallocates the backing store even when the value
      // is unchanged, so the canvas only follows the container when it moves.
      const rect = canvasRectRef.current ?? measureCanvas();
      if (!rect) return;
      if (canvas.width !== rect.width) canvas.width = rect.width;
      if (canvas.height !== rect.height) canvas.height = rect.height;

      // Canvas state survives across frames: an opacity or a halo left on by the
      // previous frame would fade the grid and everything drawn before the first
      // reset.
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // The viewport is camera state, not part of the pose: it must track the mechanism
      // being edited even while `mechanismRef` points at a stale analysed/preview copy
      // (a mode swing, say), or panning while one is shown would snap the drawing back
      // to whatever viewport was current when that copy was made.
      const viewport = restingRef.current.viewport;

      if (showGrid) draw_grid(ctx, viewport, canvas.width, canvas.height);

      draw_axes(ctx, viewport, canvas.width, canvas.height);

      // Under the mechanism, like the grid: it is scaffolding for the gesture in
      // progress, not something being drawn.
      if (cursorOnCanvasRef.current) {
        const held = snapFeedbackRef.current;
        draw_snap_feedback(
          ctx,
          {
            guides: snapSettings.showAngleGuides ? held.guides : [],
            ...(snapSettings.highlightSnap
              ? { gridX: held.gridX, gridY: held.gridY }
              : {}),
          },
          viewport,
          canvas.width,
          canvas.height,
        );
      }

      // Trajectoires des points sondés, sous les éléments du mécanisme.
      for (const trajectory of live?.trajectories ?? EMPTY_TRAJECTORIES)
        draw_trajectory(
          ctx,
          viewport,
          trajectory,
          false /* TODO : add variable */,
        );

      // Retour visuel undo/redo : révèle les recréations, prépare les fantômes.
      processConstraintChange();
      const visibleConstraints = computeVisibleConstraints();

      const now = performance.now();

      // A dimension states a design value, and the analysis is not about design values: a
      // mode swings the mechanism away from the pose it was dimensioned at, and a chain
      // picks out parts a cluttered drawing hides. So the dimensions step aside as soon as
      // the panel points at anything, as they already do in simulation. Faded rather than
      // cut, so travelling down a card's rows does not make them blink.
      const analysing =
        modePreviewRef.current !== null ||
        highlightRef.current.elements.size > 0;
      if (analysing) lastSwingAtRef.current = now;
      // They leave at once but come back late: crossing from one row to the next passes
      // through a frame or two pointing at nothing, and dimensions flashing in between
      // would be worse than their absence.
      const returning =
        !analysing &&
        now - lastSwingAtRef.current > MODE_ANIMATION.DIMENSION_RETURN_DELAY_MS;
      const fadeStep =
        ((returning ? 1 : analysing ? -1 : 0) *
          (now - (lastFadeAtRef.current || now))) /
        CONSTRAINT_REVEAL_FADE_MS;
      dimensionFadeRef.current = Math.min(
        1,
        Math.max(0, dimensionFadeRef.current + fadeStep),
      );
      lastFadeAtRef.current = now;
      if (dimensionFadeRef.current < 1)
        for (const [id, opacity] of visibleConstraints)
          visibleConstraints.set(id, opacity * dimensionFadeRef.current);
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

      draw_mechanical_canvas(ctx, {
        viewport,
        hoveredPart: hoveredPartRef.current,
        state: canvasStateRef.current,
        mechanicalElements: mechanismRef.current.mechanicalElements,
        constraintElements: ghostConstraints.length
          ? [...modelConstraints, ...ghostConstraints]
          : modelConstraints,
        loads: mechanismRef.current.loads,
        visibleConstraints,
        ghostConstraintIDs: ghostIDs,
        cursorOnCanvas: cursorOnCanvasRef.current,
        // A running kinematic simulation moves the mechanism away from the poses the loads
        // were placed at, so they step aside rather than point at nothing.
        hideLoads: appModeRef.current === "kinematic",
        dimensionSnapped: snapFeedbackRef.current.distanceSnapped ?? false,
        highlight: highlightRef.current,
        redundancySymbols: redundancySymbolsRef.current,
        now,
      });
    }, [
      showGrid,
      snapSettings.highlightSnap,
      snapSettings.showAngleGuides,
      computeVisibleConstraints,
      processConstraintChange,
      measureCanvas,
      liveFrameRef,
      modePreviewRef,
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
    //
    // Idempotent par nécessité : certains navigateurs déclenchent pointercancel
    // juste après un pointerup déjà traité pour le même relâchement (autour de
    // releasePointerCapture notamment), les deux dans le même tick — avant que
    // canvasStateRef n'ait pu se rafraîchir au rendu suivant. Sans cette garde,
    // le deuxième appel rejoue le scellement du geste sur un état encore
    // "MovingXXX" et double une action de l'historique.
    const onMouseUpHandler = useCallback(() => {
      if (mouseButtonDownRef.current === "none") return;
      handleEventRef.current({
        type: "MouseButtonUp",
      });
      mouseButtonDownRef.current = "none";
    }, []);

    const onPointerDownHandler = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ) => {
      window.getSelection()?.removeAllRanges();
      cursorOnCanvasRef.current = true;
      // A gesture is rare enough to pay for one measurement, and it catches the
      // case the observer cannot see: a canvas moved without being resized.
      measureCanvas();
      // Capture le pointeur : une fois le bouton enfoncé, les pointermove / pointerup continuent d'arriver sur le canvas même si le curseur sort de ses limites.
      event.currentTarget.setPointerCapture(event.pointerId);
      mousePositionRef.current = new Point2<"screen">(
        event.clientX,
        event.clientY,
      ).sub(canvasOffsetRef.current);
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
      cursorOnCanvasRef.current = true;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvasRectRef.current ?? measureCanvas();
      if (!rect) return;

      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);
      mousePositionRef.current = new Point2(x, y);

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

    // A gesture in progress keeps the canvas: the pointer is captured, and what it draws (a selection rectangle, an element being placed) must survive the cursor straying outside.
    // Same for the probe metric popover: it sits outside the canvas element, so reaching it would otherwise trigger this.
    const onPointerLeaveHandler = () => {
      if (
        mouseButtonDownRef.current === "none" &&
        canvasStateRef.current.type !== "PlacingProbeMetrics"
      )
        cursorOnCanvasRef.current = false;
    };

    /**
     * The hovered part under the last known cursor position, bounded and snapped.
     * Reads the current state, so it answers for whatever tool is armed right now, free of side effects, so it can be called outside a gesture.
     * Returns the bounded cursor too, which gestures read raw.
     */
    const computeHover = useCallback((): {
      hoveredPart: HoveredPart;
      worldMousePos: Point2;
      /** What the snap took hold of, to be shown. Carried out of the snap rather than read back from the position: a point pulled onto the grid alone lands on a round direction often enough by chance. */
      snapFeedback: SnapFeedback;
    } => {
      const currMech = mechanismRef.current;

      // Bounded here, where the cursor enters the system, so that hit-testing
      // and the gestures reading the raw mouse share one bounded point.
      // TODO : pourquoi bound ?
      const worldMousePos = clamp_to_bounds(
        screen2world(mousePositionRef.current, currMech.viewport),
        canvasStateRef.current,
        currMech.mechanicalElements,
        currMech.viewport,
      );
      const newHoveredPart = get_hovered_part(
        currMech.mechanicalElements,
        currMech.constraintElements,
        currMech.loads,
        computeVisibleConstraints(),
        worldMousePos,
        canvasStateRef.current,
        currMech.viewport,
        // What the previous frame asked of the drag: the mechanism read here has
        // answered that, not the cursor, which has since moved on.
        oldPositionRef.current,
      );
      let snapFeedback: SnapFeedback = NO_FEEDBACK;
      if (snapToGrid && appModeRef.current === "edition") {
        const { position, ...feedback } = snap_hover(
          newHoveredPart,
          canvasStateRef.current,
          currMech.mechanicalElements,
          currMech.viewport,
          snapSettings,
        );
        newHoveredPart.position = position;
        snapFeedback = feedback;
      }
      if (
        snapToGrid &&
        newHoveredPart.type === "Void" &&
        appModeRef.current === "edition"
      ) {
        const { position, ...feedback } = snap_dimension_position(
          newHoveredPart.position,
          canvasStateRef.current,
          currMech.mechanicalElements,
          currMech.constraintElements,
          currMech.viewport,
          snapSettings,
        );
        newHoveredPart.position = position;
        // A dimension gesture is never one the point snap answers to, so there is nothing to reconcile: whichever spoke, spoke alone.
        if (feedback.guides.length > 0 || feedback.distanceSnapped)
          snapFeedback = feedback;
      }
      if (newHoveredPart.type === "Void" && appModeRef.current === "edition") {
        // Align load direction to world/beam axes, and its length to a round value
        const screenHoverPos = world2screen(
          newHoveredPart.position,
          currMech.viewport,
        );
        const newScreenHoverPos = snap_load_hover(
          screenHoverPos,
          canvasStateRef.current,
          currMech.mechanicalElements,
          currMech.loads,
          currMech.viewport,
        );
        newHoveredPart.position = screen2world(
          newScreenHoverPos,
          currMech.viewport,
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
          currMech.viewport,
        );
      return { hoveredPart: newHoveredPart, worldMousePos, snapFeedback };
    }, [snapToGrid, snapSettings, computeVisibleConstraints]);

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

        const {
          hoveredPart: newHoveredPart,
          worldMousePos,
          snapFeedback,
        } = computeHover();
        refreshRevealFromHover(newHoveredPart);

        snapFeedbackRef.current = snapFeedback;
        setHoveredPart(newHoveredPart);

        canvasStateReducer(
          canvasStateRef.current,
          newHoveredPart,
          oldPositionRef.current,
          mouseButtonDownRef.current,
          event,
          currMech.mechanicalElements,
          currMech.constraintElements,
          currMech.loads,
          currMech.viewport,
          setCanvasState,
          applyActions,
          undoMechanism,
          redoMechanism,
          onMouseUpHandler,
          appModeRef.current !== "edition",
          canSimulationGrabRef.current,
          onSimulationGrabRef.current,
          onSimulationGrabEndRef.current,
          worldMousePos,
        );
        oldPositionRef.current = newHoveredPart.position.clone();
      },
      [
        applyActions,
        undoMechanism,
        redoMechanism,
        setCanvasState,
        setHoveredPart,
        computeHover,
        refreshRevealFromHover,
        onMouseUpHandler,
      ],
    );
    handleEventRef.current = handleEvent;

    // The hover answers the armed tool, so it goes stale when the tool changes
    // under a still cursor — a click that ends a placement, a shortcut, Escape.
    // Recomputed without the reducer: this is a refresh, not a gesture.
    useEffect(() => {
      const { hoveredPart: refreshed, snapFeedback } = computeHover();
      refreshRevealFromHover(refreshed);
      snapFeedbackRef.current = snapFeedback;
      setHoveredPart(refreshed);
      oldPositionRef.current = refreshed.position.clone();
    }, [
      canvasState.type,
      computeHover,
      refreshRevealFromHover,
      setHoveredPart,
    ]);

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

    // The measured element stays selected either way; only the tool differs,
    // the probe tool going on to place another.
    const closeProbeMetricsPopover = useCallback(() => {
      const state = canvasStateRef.current;
      if (state.type !== "PlacingProbeMetrics") return;
      setCanvasState(
        state.armed
          ? { type: "PlacingProbe" }
          : { type: "SelectedElement", elementID: state.elementID },
      );
    }, [setCanvasState]);

    useEffect(() => {
      const handleGlobalKeyDown = (event: KeyboardEvent) => {
        if (isTypingInInput()) return;
        if (canvasStateRef.current.type === "PlacingProbeMetrics") {
          // Escape must close the popover even when focus has drifted off it
          // (e.g. after Tab) — the local handler on the Paper only catches it
          // while focus is still inside.
          if (event.key === "Escape") closeProbeMetricsPopover();
          return;
        }
        if (event.key === " ") {
          event.preventDefault();
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
    }, [handleEvent, closeProbeMetricsPopover]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();

        const rect = canvasRectRef.current;
        if (!rect) return;
        const center: ScreenPoint = new Point2(
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
          pendingPanRef.current = pendingPanRef.current.add(
            new Point2(-deltaX, -deltaY),
          );
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
        ? {
            reason: t(hoveredPart.rejected, hoveredPart.rejectedVars),
            anchor: mousePositionRef.current,
          }
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
          : canSimulationGrab &&
              ["Selecting", "SelectedElement"].includes(canvasState.type) &&
              hoveredPart.type !== "Void" &&
              hoveredPart.type !== "Probe" &&
              hoveredPart.type !== "MotorArrow"
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
          applyActions([
            {
              type: "ChangeForce",
              id: element.id,
              newVector: element.vector.with_length(newValue),
              oldVector: element.vector,
            },
          ]);
          return true;
        case "moment":
          applyActions([
            {
              type: "ChangeMoment",
              id: element.id,
              // The editor shows the magnitude unsigned: a moment's sign is
              // its rotation direction, picked when it is placed, so editing
              // the value here resizes the arc without turning it around.
              newValue: newValue * (element.value < 0 ? -1 : 1),
              oldValue: element.value,
            },
          ]);
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
          applyActions([
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
          ]);
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
          backgroundColor: "background.default",
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
          onPointerLeave={onPointerLeaveHandler}
          onContextMenu={onContextMenuHandler}
          tabIndex={0}
          aria-label={t("canvas_label")}
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
            signed={"targetID" in editingElement}
            allowZero={
              editingElement.type === "distributed-force" &&
              !is_zero_load(
                isEditingValue && canvasState.part === "end"
                  ? editingElement.magnitudeStart
                  : editingElement.magnitudeEnd,
              )
            }
            position={
              // Loads have no `.position`; their editable label sits at a
              // computed screen anchor next to the drawn value.
              editingElement.type === "force" ||
              editingElement.type === "moment" ||
              editingElement.type === "distributed-force"
                ? load_value_anchor(
                    editingElement,
                    mechanism.mechanicalElements,
                    mechanism.viewport,
                    // Seule une charge existante est ré-éditée : un `PlacingValue`
                    // ne concerne que les cotes, qui n'ont pas de `part`.
                    isEditingValue ? canvasState.part : undefined,
                  )
                : world2screen(
                    "position" in editingElement
                      ? editingElement.position
                      : ZERO,
                    mechanism.viewport,
                  )
            }
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
                  applyActions([
                    {
                      type: actionType,
                      id: editingElement.id,
                      newValue: newValue,
                      oldValue: editingElement.value,
                    },
                  ]);
                }
              }
              // Valider sur un élément qu'on vient de poser réarme son outil,
              // pour en enchaîner un autre sans repasser par la palette. Une
              // cote éditée depuis un outil resté armé y revient de même.
              if (isPlacingValue) {
                if (editingElement.type === "gear-ratio") {
                  setCanvasState({ type: "GearRatioConstraintStart" });
                } else {
                  setCanvasState({ type: "DimensionStart" });
                }
              } else if (isEditingValue && canvasState.rearm) {
                setCanvasState({ type: canvasState.rearm });
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
                applyActions([
                  {
                    type: "DeleteElement",
                    element: editingElement,
                  },
                ]);
                setCanvasState({ type: "Selecting" });
              } else if (isEditingValue && canvasState.rearm) {
                setCanvasState({ type: canvasState.rearm });
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
              <OnCanvasProbeMetricSelector
                element={probedElement}
                position={world2screen(
                  canvasState.position,
                  mechanism.viewport,
                )}
                onToggle={(newProbes) =>
                  applyActions([
                    {
                      type: "SetProbes",
                      elementID: probedElement.id,
                      newProbes,
                      oldProbes: probedElement.probes ?? [],
                    },
                  ])
                }
                onClose={closeProbeMetricsPopover}
              />
            );
          })()}
      </Box>
    );
  },
);

export default MechanicalCanvas;
