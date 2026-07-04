import React, { useRef, useEffect, useCallback, forwardRef } from "react";
import {
  Action,
  ActionBundleType,
  ActionType,
  AppMode,
  CanvasEvent,
  CanvasState,
  ConstraintElement,
  HoveredPart,
  ID,
  Mechanism,
  Point2,
  PropertiesPanelTab,
  ViewportChange,
  ZERO,
} from "../../types";
import { world_to_screen, screen_to_world } from "../../utils";
import {
  COLORS,
  CONSTRAINT_REVEAL_COOLDOWN_MS,
  CONSTRAINT_REVEAL_FADE_MS,
  DIM,
  HIT_TOLERANCE,
} from "../../constants/rendering-specs";
import { Box } from "@mui/material";
import { drawMechanicalCanvas as draw_mechanical_canvas } from "./draw-canvas";
import { canvasStateReducer } from "./canvas-state-reducer";
import { get_constraint_element_from_id } from "../mechanism/connect-actions";
import { get_hovered_part } from "./get-hover";
import { compute_visible_constraints, connected_constraints } from "./utils";
import { ConstraintEditor } from "./ConstraintEditor";
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
  setAppMode: (mode: AppMode) => void;
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
      setAppMode,
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

    mechanismRef.current = mechanism;
    hoveredPartRef.current = hoveredPart;
    canvasStateRef.current = canvasState;

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

      // Définit la taille du canvas à la taille du conteneur
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      // Met à jour l'offset du canvas
      canvasOffsetRef.current = new Point2(rect.left, rect.top);

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
    }, [showGrid, computeVisibleConstraints, processConstraintChange]);

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
        render();
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

    const onMouseUpHandler = () => {
      handleEvent({
        type: "MouseButtonUp",
      });
      mouseButtonDownRef.current = "none";
    };

    const onMouseDownHandler = (event: React.MouseEvent<HTMLCanvasElement>) => {
      window.getSelection()?.removeAllRanges();
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

    const onMouseMoveHandler = (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      const x = (event.clientX - rect.left) * (canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (canvas.height / rect.height);
      const newPos = new Point2(x, y);

      mousePositionRef.current = newPos;

      handleEvent({
        type: "MouseMove",
        mouseDelta: new Point2(event.movementX, event.movementY),
      });
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

        const worldMousePos = screen_to_world(
          mousePositionRef.current,
          currMech.viewport,
        );
        let newHoveredPart = get_hovered_part(
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
          appMode === "edition" &&
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
            canvasStateRef.current.type === "PlacingMoment" ||
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
        );
        oldPositionRef.current = newHoveredPart.position.clone();
      },
      [
        applyActions,
        undoMechanism,
        redoMechanism,
        setCanvasState,
        setHoveredPart,
        setAppMode,
        snapToGrid,
        computeVisibleConstraints,
        refreshRevealFromHover,
      ],
    );

    const isTypingInInput = (): boolean => {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName.toLowerCase();
      if (
        tag === "input" ||
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

        const rect = canvas.getBoundingClientRect();
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

    const cursor =
      canvasState.type === "SimulationDragging"
        ? "grabbing"
        : appMode !== "edition" &&
            ["Selecting", "SelectedElement"].includes(canvasState.type) &&
            hoveredPart.type !== "Void"
          ? "grab"
          : [
                "DimensionStart",
                "DimensionNode",
                "DimensionEdge",
                "DimensionNodeToNode",
                "DimensionEdgeToNode",
                "DimensionAngle",
                "DimensionRadius",
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

    const editingConstraint =
      canvasState.type === "EditingConstraint"
        ? get_constraint_element_from_id(
            canvasState.elementID,
            mechanism.constraintElements,
          )
        : null;

    return (
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <canvas
          ref={mergeRefs(canvasRef, ref)}
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: COLORS.BACKGROUND,
            cursor,
            touchAction: "none",
          }}
          onMouseUp={onMouseUpHandler}
          onMouseDown={onMouseDownHandler}
          onMouseEnter={onMouseUpHandler}
          onMouseMove={onMouseMoveHandler}
          onContextMenu={onContextMenuHandler}
          tabIndex={0}
          aria-label="Canvas de conception mécanique"
          role="img"
        />
        {editingConstraint && (
          <ConstraintEditor
            constraint={editingConstraint}
            position={world_to_screen(
              editingConstraint.position,
              mechanism.viewport,
            )}
            onCommit={(newValue) => {
              if (!("value" in editingConstraint)) return;

              let actionType: ActionType;
              switch (editingConstraint.type) {
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
                case "gear-ratio":
                  actionType = "ChangeGearRatioValue";
                  break;
              }
              if (actionType) {
                applyActions(
                  [
                    {
                      type: actionType,
                      id: editingConstraint.id,
                      newValue: newValue,
                      oldValue: editingConstraint.value,
                    },
                  ],
                  "ChangeDimension",
                );
              }
              if (
                canvasState.type === "EditingConstraint" &&
                canvasState.isPlacing
              ) {
                if (editingConstraint.type === "gear-ratio") {
                  setCanvasState({ type: "GearRatioConstraintStart" });
                } else {
                  setCanvasState({ type: "DimensionStart" });
                }
              } else {
                setCanvasState({
                  type: "SelectedElement",
                  elementID: editingConstraint.id,
                });
              }
            }}
            onCancel={(constraint) => {
              if (
                canvasState.type === "EditingConstraint" &&
                canvasState.isPlacing
              ) {
                applyActions(
                  [
                    {
                      type: "DeleteElement",
                      element: constraint,
                    },
                  ],
                  "Other",
                );
                setCanvasState({ type: "Selecting" });
              } else {
                setCanvasState({
                  type: "SelectedElement",
                  elementID: constraint.id,
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
                position={world_to_screen(
                  canvasState.position,
                  mechanism.viewport,
                )}
                onCommit={(newProbes) => {
                  const oldProbes = probedElement.probes ?? [];
                  const changed =
                    newProbes.length !== oldProbes.length ||
                    newProbes.some(
                      (p, i) => p.metric !== oldProbes[i].metric,
                    );
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
