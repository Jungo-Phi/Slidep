import React, { useRef, useEffect, useState, useCallback } from "react";
import { COLORS } from "../../constants/rendering-specs";
import { Box } from "@mui/material";
import { drawMechanicalCanvas } from "./draw-canvas";
import { Mechanism } from "../../types/mechanism";
import { Point2, ZERO } from "../../types/point2";
import { Action, CanvasEvent } from "../../types/actions";
import { canvasStateReducer } from "./canvas-state-reducer";
import { CanvasState } from "../../types/canvas-state";
import { shown_element_name } from "../../types";
import { get_constraint_element_from_id } from "./connect-actions";
import { get_hovered_part } from "./get-hover";
import type { ActionBundleType, ActionType } from "../../types";
import { HoveredPart } from "../../types/hovered-part";
import { ConstraintEditor } from "./ConstraintEditor";

interface MechanicalCanvasProps {
  setCanvasState: (state: CanvasState) => void;
  canvasState: CanvasState;
  updateMechanism: (
    actions: Action[],
    actionBundleType: ActionBundleType,
  ) => void;
  mechanism: Mechanism;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  hoveredPart: HoveredPart;
  undoMechanism: () => void;
  redoMechanism: () => void;
  IDcounter: React.MutableRefObject<number>;
}

export const MechanicalCanvas: React.FC<MechanicalCanvasProps> = ({
  setCanvasState,
  canvasState,
  updateMechanism,
  mechanism,
  setHoveredPart,
  hoveredPart,
  undoMechanism,
  redoMechanism,
  IDcounter,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasOffsetRef = useRef(ZERO);

  const [mousePosition, setmousePosition] = useState(ZERO);
  const [oldPosition, setOldPosition] = useState(ZERO);
  const [isMouseDown, setMouseDown] = useState(false);
  const [cursor, setCursor] = useState("default");

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

    // Dessine les éléments
    drawMechanicalCanvas(
      ctx,
      canvas.width,
      canvas.height,
      hoveredPart,
      canvasState,
      mechanism.mechanicalElements,
      mechanism.constraintElements,
    );

    // Dessine les actions récentes (DEBUG)
    let actions = mechanism.history.flat();
    actions = actions.filter((a) => a.type !== "Blank");
    if (actions.length > 8) {
      actions = actions.slice(-8);
    }
    actions.reverse();
    ctx.font = "12px Verdana";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.shadowBlur = 1;
    ctx.shadowColor = "black";
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.STROKE;
    let i = 0;
    actions.forEach((action) => {
      let text: string = action.type;
      switch (action.type) {
        case "CreateElement":
        case "DeleteElement":
          text += " : " + shown_element_name(action.element);
          break;
        case "GroundNode":
          text += " : " + action.id.toString().padStart(3, "0");
          break;
        case "SwitchAttachedGearDirection":
          text += " : " + (action.direction ? "counterclockwise" : "clockwise");
          break;
        case "TightenBelt":
          text += " : " + (action.tightened ? "tighten" : "loosen");
          break;
        case "MoveNode":
        case "MoveEdgeStart":
        case "MoveEdgeEnd":
        case "MoveEdgeBody":
          text +=
            " " +
            action.id.toString().padStart(3, "0") +
            " : " +
            action.newPosition;
          break;
        case "MoveElements":
        case "ChangeMass":
        case "ChangeStiffness":
        case "ChangeDamping":
          text += " : " + action.delta;
          break;
        case "ChangeGearRadius":
          text += "  radius : " + action.newRadius.toFixed(1);
          break;
        case "ConnectsFixedEdges":
        case "ConnectsRotatingEdges":
        case "ConnectsParentBeam":
        case "ConnectsFixedNodeStart":
        case "ConnectsFixedNodeEnd":
        case "ConnectsFixedNodesBody":
        case "ConnectsMeshedGears":
        case "ConnectsAttachedGears":
        case "ConnectsFixedGears":
        case "ConnectsAttachedBelt":
          text +=
            (action.disconnect ? " - x -" : " -o-") +
            " : " +
            action.connectID.toString().padStart(3, "0") +
            " on " +
            action.elementID.toString().padStart(3, "0");
          break;
      }
      ctx.fillText(
        mechanism.history.flat().length - i + " " + text,
        160,
        30 + 18 * i,
      );
      ctx.shadowBlur = 0;
      i += 1;
    });

    // Dessine l'état du canvas (StateCanvas)
    let text: string = canvasState.type;
    ctx.fillText(text, 600, 30);

    // Dessine l'élément survolé (DEBUG)
    text = hoveredPart.type;
    switch (hoveredPart.type) {
      case "Node":
        text +=
          hoveredPart.id.toString().padStart(3, "0") +
          (hoveredPart.beamBodyHover ? " - beamHover" : "");
        break;
      case "Edge":
        text +=
          " " +
          hoveredPart.id.toString().padStart(3, "0") +
          " - " +
          hoveredPart.part;
        break;
      case "GearTooth":
        text += " " + hoveredPart.id.toString().padStart(3, "0");
        break;
      case "BeltBody":
        text +=
          " " +
          hoveredPart.id.toString().padStart(3, "0") +
          "  section : " +
          hoveredPart.section;
        break;
      case "Constraint":
        text += hoveredPart.id.toString().padStart(3, "0");
        break;
    }
    ctx.fillText(text, 900, 30);
  }, [canvasState, mechanism, hoveredPart]);

  useEffect(() => {
    render();
  }, [render, canvasState, mechanism, hoveredPart]);

  useEffect(() => {
    const handleResize = () => render();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [render]);

  useEffect(() => {
    setCursor(
      [
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
        : "default",
    );
  }, [canvasState]);

  const onMouseUpHandler = () => {
    setMouseDown(false);
    handleEvent({
      type: "MouseLeftButtonUp",
    });
  };
  const onMouseDownHandler = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setMouseDown(true);
    setmousePosition(
      new Point2(event.clientX, event.clientY).sub(canvasOffsetRef.current),
    );
    if (event.button === 0) {
      handleEvent({
        type: "MouseLeftButtonDown",
        shiftKey: event.shiftKey,
      });
    } else if (event.button === 2) {
      handleEvent({
        type: "MouseRightButtonDown",
      });
    }
  };
  const onMouseMoveHandler = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setmousePosition(
      new Point2(event.clientX, event.clientY).sub(canvasOffsetRef.current),
    );
    handleEvent({
      type: "MouseMove",
      mouseDelta: new Point2(event.movementX, event.movementY),
    });
  };
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
      handleEvent({
        type: "KeyDown",
        key: event.key,
        crtlKey: event.ctrlKey,
      });
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canvasState,
    mechanism,
    hoveredPart,
    mousePosition,
    oldPosition,
    isMouseDown,
  ]);

  function handleEvent(event: CanvasEvent) {
    const newHoveredPart = get_hovered_part(
      mechanism.mechanicalElements,
      mechanism.constraintElements,
      true, // TODO : Add parameter to toggle showing constraints
      mousePosition,
      canvasState,
    );
    setHoveredPart(newHoveredPart);

    canvasStateReducer(
      canvasState,
      setCanvasState,
      newHoveredPart,
      oldPosition,
      isMouseDown,
      event,
      mechanism.mechanicalElements,
      mechanism.constraintElements,
      updateMechanism,
      undoMechanism,
      redoMechanism,
      onMouseUpHandler,
      IDcounter,
    );
    setOldPosition(hoveredPart.position.clone());
  }

  const onContextMenuHandler = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

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
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: COLORS.BACKGROUND,
          cursor,
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
      {canvasState.type === "EditingConstraint" && (
        <ConstraintEditor
          constraint={get_constraint_element_from_id(
            canvasState.elementID,
            mechanism.constraintElements,
          )}
          position={
            get_constraint_element_from_id(
              canvasState.elementID,
              mechanism.constraintElements,
            ).position
          }
          onCommit={(newValue) => {
            const constraint = get_constraint_element_from_id(
              canvasState.elementID,
              mechanism.constraintElements,
            );
            if (!("value" in constraint)) return;

            let actionType: ActionType;
            switch (constraint.type) {
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
              updateMechanism(
                [
                  {
                    type: actionType,
                    id: constraint.id,
                    newValue: newValue,
                    oldValue: constraint.value,
                  },
                ],
                "ChangeDimension",
              );
            }
            if (canvasState.isPlacing) {
              if (constraint.type === "gear-ratio") {
                setCanvasState({ type: "GearRatioConstraintStart" });
              } else {
                setCanvasState({ type: "DimensionStart" });
              }
            } else {
              setCanvasState({
                type: "SelectedElement",
                elementID: constraint.id,
              });
            }
          }}
          onCancel={(constraint) => {
            if (canvasState.isPlacing) {
              updateMechanism(
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
};

export default MechanicalCanvas;
