import { describe, expect, it } from "vitest";
import { armed_tool_state } from "./arm-tool";
import { Point2 } from "../../types/point2";
import type { CanvasState, ID, MechanicalElement } from "../../types";

/**
 * Arming a tool over a selection: the selected element stands for the tool's
 * first click, when the tool can take it whole and takes it without building.
 */

const id = (n: number) =>
  `00000000-0000-0000-0000-00000000000${n}` as ID;

const PIVOT = id(1);
const BEAM = id(2);
const SPRING = id(3);
const GEAR = id(4);
const BELT = id(5);
const FORCE = id(6);
const PIVOT2 = id(7);
const BEAM2 = id(8);
const GEAR2 = id(9);

const mechanical: MechanicalElement[] = [
  {
    type: "pivot",
    id: PIVOT,
    position: new Point2(0, 0),
    isGrounded: false,
    probes: [],
    overlays: {},
    rotatingEdgesIDs: [],
    fixedGearsIDs: [],
  },
  {
    type: "beam",
    id: BEAM,
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(100, 40),
    probes: [],
    overlays: {},
    fixedNodesBodyIDs: [],
  },
  {
    type: "spring",
    id: SPRING,
    positionStart: new Point2(0, 100),
    positionEnd: new Point2(100, 140),
    probes: [],
    overlays: {},
    stiffness: 1,
  },
  {
    type: "gear",
    id: GEAR,
    position: new Point2(200, 0),
    angle: 0,
    radius: 20,
    parentAxleID: PIVOT,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    probes: [],
    overlays: {},
  },
  {
    type: "pivot",
    id: PIVOT2,
    position: new Point2(0, 100),
    isGrounded: false,
    probes: [],
    overlays: {},
    rotatingEdgesIDs: [],
    fixedGearsIDs: [],
  },
  {
    type: "beam",
    id: BEAM2,
    positionStart: new Point2(0, 0),
    positionEnd: new Point2(0, 100),
    probes: [],
    overlays: {},
    fixedNodesBodyIDs: [],
  },
  {
    type: "gear",
    id: GEAR2,
    position: new Point2(260, 0),
    angle: 0,
    radius: 40,
    parentAxleID: PIVOT2,
    fixedNodesBodyIDs: [],
    meshedGearsIDs: [],
    probes: [],
    overlays: {},
  },
  {
    type: "belt",
    id: BELT,
    positionStart: new Point2(300, 0),
    positionEnd: new Point2(400, 0),
    probes: [],
    overlays: {},
    attachedGearsIDs: [],
    closed: false,
  },
];

/** The selection of `ids`, as the canvas holds it. */
const selection = (ids: ID[]): CanvasState =>
  ids.length === 1
    ? { type: "SelectedElement", elementID: ids[0] }
    : { type: "SelectedMultiple", elementIDs: ids };

const armed = (
  tool: Parameters<typeof armed_tool_state>[0],
  ...selected: ID[]
) =>
  armed_tool_state(
    tool,
    selection(selected),
    mechanical,
    [],
    [
      {
        type: "moment",
        id: FORCE,
        targetID: BEAM,
        value: 10,
      },
    ],
    { scale: 1, pan: new Point2(0, 0) },
  );

describe("armed_tool_state", () => {
  it("cote l'élément sélectionné selon sa nature", () => {
    expect(armed("DimensionStart", BEAM)).toEqual({
      type: "DimensionEdge",
      edgeID: BEAM,
    });
    expect(armed("DimensionStart", PIVOT)).toEqual({
      type: "DimensionNode",
      nodeID: PIVOT,
    });
    expect(armed("DimensionStart", GEAR)).toEqual({
      type: "DimensionRadius",
      gearID: GEAR,
    });
    // Measured whole, not as the chord between its two ends.
    expect(armed("DimensionStart", BELT)).toEqual({
      type: "DimensionBelt",
      beltID: BELT,
    });
  });

  it("amorce les contraintes que la sélection peut ouvrir", () => {
    expect(armed("NormalConstraintStart", BEAM)).toEqual({
      type: "NormalConstraintEdge",
      startEdgeID: BEAM,
    });
    expect(armed("EqualConstraintStart", GEAR)).toEqual({
      type: "EqualConstraintGear",
      startGearID: GEAR,
    });
    expect(armed("GearRatioConstraintStart", GEAR)).toEqual({
      type: "GearRatioConstraintGear",
      startGearID: GEAR,
    });
    expect(armed("HorizontalVerticalConstraintStart", PIVOT)).toEqual({
      type: "HorizontalVerticalConstraintNode",
      startNodeID: PIVOT,
    });
  });

  it("amorce charges et sondes", () => {
    expect(armed("PlacingForceStart", PIVOT)).toMatchObject({
      type: "PlacingForceEnd",
      startHover: { id: PIVOT },
    });
    expect(armed("PlacingForceStart", BEAM)).toMatchObject({
      type: "PlacingDistributedForce",
      startHover: { id: BEAM },
    });
    expect(armed("PlacingMomentStart", GEAR)).toMatchObject({
      type: "PlacingMomentEnd",
      startHover: { id: GEAR },
    });
    expect(armed("PlacingProbe", BEAM)).toMatchObject({
      type: "PlacingProbeMetrics",
      elementID: BEAM,
      armed: true,
    });
  });

  it("n'aligne pas un edge sélectionné : armer un outil ne modifie rien", () => {
    expect(armed("HorizontalVerticalConstraintStart", BEAM)).toEqual({
      type: "HorizontalVerticalConstraintStart",
    });
  });

  it("arme l'outil tel quel quand la sélection ne peut rien commencer", () => {
    // Le corps d'un ressort ne prend pas de charge répartie.
    expect(armed("PlacingForceStart", SPRING)).toEqual({
      type: "PlacingForceStart",
    });
    // Une courroie n'est ni sondée ni chargée.
    expect(armed("PlacingProbe", BELT)).toEqual({ type: "PlacingProbe" });
    expect(armed("PlacingMomentStart", BELT)).toEqual({
      type: "PlacingMomentStart",
    });
    // Le perpendiculaire ne vise que des edges.
    expect(armed("NormalConstraintStart", PIVOT)).toEqual({
      type: "NormalConstraintStart",
    });
    // Une charge est sélectionnable mais ne commence aucun outil.
    expect(armed("DimensionStart", FORCE)).toEqual({ type: "DimensionStart" });
    // Un outil qui part du curseur libre.
    expect(armed("PlacingPivot", BEAM)).toEqual({ type: "PlacingPivot" });
  });

  it("cote entre deux éléments sélectionnés, dans l'ordre du choix", () => {
    expect(armed("DimensionStart", PIVOT, PIVOT2)).toEqual({
      type: "DimensionNodeToNode",
      startNodeID: PIVOT,
      endNodeID: PIVOT2,
    });
    expect(armed("DimensionStart", BEAM, BEAM2)).toEqual({
      type: "DimensionAngle",
      startEdgeID: BEAM,
      endEdgeID: BEAM2,
    });
    // La distance d'un point à une droite se désigne dans les deux sens.
    expect(armed("DimensionStart", PIVOT, BEAM2)).toEqual({
      type: "DimensionEdgeToNode",
      edgeID: BEAM2,
      nodeID: PIVOT,
    });
    expect(armed("DimensionStart", BEAM2, PIVOT)).toEqual({
      type: "DimensionEdgeToNode",
      edgeID: BEAM2,
      nodeID: PIVOT,
    });
  });

  it("ne pose aucune contrainte que la paire suffirait à construire", () => {
    for (const tool of [
      "ParallelConstraintStart",
      "NormalConstraintStart",
      "EqualConstraintStart",
    ] as const)
      expect(armed(tool, BEAM, BEAM2)).toEqual({ type: tool });
    expect(armed("GearRatioConstraintStart", GEAR, GEAR2)).toEqual({
      type: "GearRatioConstraintStart",
    });
    expect(armed("HorizontalVerticalConstraintStart", PIVOT, PIVOT2)).toEqual({
      type: "HorizontalVerticalConstraintStart",
    });
  });

  it("arme l'outil tel quel quand la paire ne cote rien", () => {
    // Un rayon et une longueur de courroie se cotent seuls.
    expect(armed("DimensionStart", GEAR, GEAR2)).toEqual({
      type: "DimensionStart",
    });
    expect(armed("DimensionStart", PIVOT, GEAR)).toEqual({
      type: "DimensionStart",
    });
    // Une charge et une sonde ne prennent qu'un élément.
    expect(armed("PlacingProbe", BEAM, BEAM2)).toEqual({ type: "PlacingProbe" });
    expect(armed("PlacingForceStart", PIVOT, PIVOT2)).toEqual({
      type: "PlacingForceStart",
    });
    // Trois éléments : la cote n'en prend pas deux au hasard.
    expect(armed("DimensionStart", BEAM, BEAM2, SPRING)).toEqual({
      type: "DimensionStart",
    });
  });

  it("arme l'outil tel quel sans sélection", () => {
    expect(
      armed_tool_state(
        "DimensionStart",
        { type: "Selecting" },
        mechanical,
        [],
        [],
        { scale: 1, pan: new Point2(0, 0) },
      ),
    ).toEqual({ type: "DimensionStart" });
  });
});
