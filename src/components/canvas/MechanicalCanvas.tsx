import React, { useRef, useEffect, useCallback, forwardRef } from "react";
import {
  Action,
  ActionBundleType,
  ActionType,
  AppMode,
  CanvasEvent,
  CanvasState,
  HoveredPart,
  Mechanism,
  Point2,
  ViewportChange,
  ZERO,
} from "../../types";
import { world_to_screen, screen_to_world } from "../../utils";
import { COLORS, DIM, HIT_TOLERANCE } from "../../constants/rendering-specs";
import { Box } from "@mui/material";
import { drawMechanicalCanvas as draw_mechanical_canvas } from "./draw-canvas";
import { canvasStateReducer } from "./canvas-state-reducer";
import { get_constraint_element_from_id } from "../mechanism/connect-actions";
import { get_hovered_part } from "./get-hover";
import { ConstraintEditor } from "./ConstraintEditor";
import { draw_grid } from "./drawing-functions";

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
  "a", "b", "c", "f", "g", "j", "k", "m", "o", "p", "r", "s", "t", "u", "w", "Delete",
]);
// Keys that place constraints/dimensions → pause simulation
const CONSTRAINT_KEYS = new Set(["d", "e", "h", "l", "n", "q", "v"]);

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
  setAppMode: (mode: AppMode) => void;
  onSpaceKey: () => void;
  onExitToEdition: () => void;
  onPauseSim: () => void;
  snapToGrid: boolean;
  showGrid: boolean;
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
      setAppMode,
      onSpaceKey,
      onExitToEdition,
      onPauseSim,
      snapToGrid,
      showGrid,
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
    const onExitToEditionRef = useRef(onExitToEdition);
    onExitToEditionRef.current = onExitToEdition;
    const onPauseSimRef = useRef(onPauseSim);
    onPauseSimRef.current = onPauseSim;

    mechanismRef.current = mechanism;
    hoveredPartRef.current = hoveredPart;
    canvasStateRef.current = canvasState;

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

      draw_mechanical_canvas(
        ctx,
        hoveredPartRef.current,
        canvasStateRef.current,
        mechanismRef.current.mechanicalElements,
        mechanismRef.current.constraintElements,
        mechanismRef.current.loads,
      );
      ctx.restore();
    }, [showGrid]);

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
          setAppMode("edition");
          setCanvasState({ type: "Selecting" });
          return;
        }
        const currMech = mechanismRef.current;

        let newHoveredPart = get_hovered_part(
          currMech.mechanicalElements,
          currMech.constraintElements,
          currMech.loads,
          true, // TODO : Add parameter to toggle showing constraints
          screen_to_world(mousePositionRef.current, currMech.viewport),
          canvasStateRef.current,
        );
        if (snapToGrid && newHoveredPart.type === "Void") {
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
        if (event.key === " ") event.preventDefault();
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

    const cursor = [
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
      </Box>
    );
  },
);

export default MechanicalCanvas;
