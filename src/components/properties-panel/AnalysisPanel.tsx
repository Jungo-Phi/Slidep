import React from "react";
import {
  Box,
  Typography,
  Divider,
  Switch,
  FormControlLabel,
  Chip,
  Button,
} from "@mui/material";
import {
  Timeline,
  ShowChart,
  RotateRight,
  Visibility,
  Add,
  WarningAmber,
  CheckCircleOutline,
} from "@mui/icons-material";
import {
  Action,
  ActionBundleType,
  AppMode,
  HoveredPart,
  Mechanism,
  PivotElement,
} from "../../types";
import { CanvasState } from "../../types/canvas-state";
import { ConstraintResidual } from "../../types/runtime-state";
import { get_sim_degrees_of_freedom } from "../solver/utils";
import { get_links_simulation, get_sim_nodes } from "../solver/parsing";
import NumberInput from "./components/NumberInput";
import ElementDisplay from "./components/ElementDisplay";
import { get_mechanical_element_from_id } from "../mechanism/connect-actions";

interface AnalysisPanelProps {
  mechanism: Mechanism;
  appMode: AppMode;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  unsatisfied: ConstraintResidual[];
}

/** Short human label for a solver link type, shown as the violation kind. */
const CONSTRAINT_NOUN: Record<string, string> = {
  MotorBeam: "Moteur bloqué",
  MotorAngle: "Moteur bloqué",
  Distance: "Longueur",
  FixedOnSegment: "Position sur poutre",
  SlideOnSegment: "Glissement",
  Angle: "Angle",
  KeepOrientation: "Orientation",
  GearMeshing: "Engrènement",
  GearMeshAngle: "Engrènement",
  GearRatio: "Rapport d'engrenage",
  CoaxialAngle: "Coaxialité",
  GearPerimeterPin: "Liaison engrenage",
  BeamFollowsAngle: "Solidarité engrenage",
  Normal: "Perpendicularité",
  Parallel: "Parallélisme",
  EqualLength: "Égalité de longueur",
  Horizontal: "Horizontalité",
  Vertical: "Verticalité",
};

type DdlStatus = { label: string; color: string };

const plural = (n: number) => (n > 1 ? "s" : "");

/**
 * One DOF number (the mechanism's mobility), read through the lens of the
 * active mode. `residual = mobility − drivers`:
 *  - static: motors act as restraints → classic iso/hyper/mécanisme trichotomy;
 *  - kinematic: the residual measures unpiloted motion;
 *  - dynamic: free DOF are normal (motion comes from forces), not a defect;
 *  - edition: neutral, design-time description (no pilotage judgement).
 */
function ddl_status(
  mobility: number,
  drivers: number,
  appMode: AppMode,
): DdlStatus {
  const residual = mobility - drivers;
  const GREEN = "success.main";
  const ORANGE = "warning.main";
  const RED = "error.main";
  const BLUE = "info.main";
  const GREY = "text.secondary";

  switch (appMode) {
    case "edition":
      if (mobility < 0) return { label: "Sur-contraint", color: RED };
      if (mobility === 0)
        return { label: "Structure rigide — 0 ddl", color: GREY };
      return {
        label: `Mécanisme — ${mobility} ddl mobile${plural(mobility)}`,
        color: BLUE,
      };

    case "static":
      if (residual > 0) return { label: "Instable (mécanisme)", color: ORANGE };
      if (residual === 0) return { label: "Isostatique", color: GREEN };
      return { label: `Hyperstatique (degré ${-residual})`, color: BLUE };

    case "kinematic":
      if (mobility === 0)
        return { label: "Structure rigide — aucun mouvement", color: GREY };
      if (drivers === 0)
        return {
          label: "Aucun moteur — déplacez le mécanisme à la main",
          color: BLUE,
        };
      if (residual === 0) return { label: "Mouvement déterminé", color: GREEN };
      if (residual > 0)
        return {
          label: `Sous-motorisé — ${residual} ddl non piloté${plural(residual)}`,
          color: ORANGE,
        };
      return { label: "Sur-contraint", color: RED };

    case "dynamic":
      if (mobility === 0) return { label: "Structure rigide", color: GREY };
      if (residual < 0) return { label: "Sur-contraint", color: RED };
      if (residual === 0) return { label: "Mouvement déterminé", color: GREEN };
      return {
        label: `Mouvement libre — ${residual} ddl`,
        color: BLUE,
      };
  }
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  mechanism,
  appMode,
  applyActions,
  setHoveredPart,
  setCanvasState,
  unsatisfied,
}) => {
  const [overlays, setOverlays] = React.useState({
    forces: false,
    velocities: false,
    constraints: false,
    path: false,
  });

  const [probes, setProbes] = React.useState<string[]>([]);

  const toggleOverlay = (key: keyof typeof overlays) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addProbe = () => {
    const metrics = ["Vitesse", "Force", "Position", "Angle"];
    const randomMetric = metrics[Math.floor(Math.random() * metrics.length)];
    setProbes((prev) => [...prev, randomMetric]);
  };

  const removeProbe = (index: number) => {
    setProbes((prev) => prev.filter((_, i) => i !== index));
  };

  const nodes = get_sim_nodes(mechanism.mechanicalElements);
  const links = get_links_simulation(mechanism.mechanicalElements, nodes);

  // Headline value = the mechanism's mobility (DOF), motors NOT subtracted —
  // that is what "degrés de liberté" means to a mechanic (a driven 4-bar reads
  // DDL = 1, not 0). A motor is a driving constraint (its link carries ddl 1),
  // so get_sim_degrees_of_freedom already nets it out; we add it back to recover
  // the bare mobility, and let the mode-specific subtitle read the relation.
  const drivingMotors = links.filter(
    (l) => l.type === "MotorBeam" || l.type === "MotorAngle",
  ).length;
  const mobility = get_sim_degrees_of_freedom(nodes, links) + drivingMotors;
  const status = ddl_status(mobility, drivingMotors, appMode);

  const motorPivots = mechanism.mechanicalElements.filter(
    (el): el is PivotElement => el.type === "pivot" && !!el.motor,
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, my: 2 }}>
      {/* Overlays */}
      <Box sx={{ mx: 2 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.forces}
                onChange={() => toggleOverlay("forces")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <ShowChart fontSize="small" />
                <Typography variant="body2">Forces de réaction</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.velocities}
                onChange={() => toggleOverlay("velocities")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Timeline fontSize="small" />
                <Typography variant="body2">Vitesses</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.constraints}
                onChange={() => toggleOverlay("constraints")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <RotateRight fontSize="small" />
                <Typography variant="body2">Contraintes (MPa)</Typography>
              </Box>
            }
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={overlays.path}
                onChange={() => toggleOverlay("path")}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Visibility fontSize="small" />
                <Typography variant="body2">Path (trajectoires)</Typography>
              </Box>
            }
          />
        </Box>
      </Box>

      <Divider />

      {/* DDL Indicator */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Degrés de liberté
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            p: 1,
            borderRadius: 1,
            backgroundColor: "action.hover",
          }}
        >
          <Typography variant="h6" fontWeight={700} color="primary">
            DDL = {mobility}
          </Typography>
          <Typography variant="body2" fontWeight={600} color={status.color}>
            {status.label}
          </Typography>
        </Box>
      </Box>

      {/* Motors */}
      {motorPivots.length > 0 && (
        <>
          <Box sx={{ mx: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Moteurs ({motorPivots.length})
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {motorPivots.map((pivot) => (
                <Box
                  key={pivot.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <ElementDisplay
                    element={pivot}
                    setHoveredPart={setHoveredPart}
                    setCanvasState={setCanvasState}
                    applyActions={applyActions}
                    size={"small"}
                    editable={false}
                  ></ElementDisplay>
                  <NumberInput
                    label="tr/min"
                    value={pivot.motor!.speed}
                    onChange={(speed) =>
                      applyActions(
                        [
                          {
                            type: "SetMotorConfig",
                            id: pivot.id,
                            newConfig: { ...pivot.motor!, speed },
                            oldConfig: pivot.motor,
                          },
                        ],
                        "ChangeConstant",
                      )
                    }
                    accent
                  />
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      <Divider />

      {/* Unsatisfied constraints */}
      {appMode !== "edition" && (
        <>
          <Box sx={{ mx: 2 }}>
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Contraintes non respectées
              </Typography>
              {unsatisfied.length > 0 && (
                <Chip
                  size="small"
                  color="error"
                  label={unsatisfied.length}
                  sx={{ height: 18, "& .MuiChip-label": { px: 0.75 } }}
                />
              )}
            </Box>
            <Box
              sx={{
                height: 96,
                overflowY: "auto",
                borderRadius: 1,
                backgroundColor: "action.hover",
                p: 0.5,
              }}
            >
              {unsatisfied.length === 0 ? (
                <Box
                  sx={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                  }}
                >
                  <CheckCircleOutline fontSize="small" color="success" />
                  <Typography variant="caption" color="text.secondary">
                    Toutes les contraintes respectées
                  </Typography>
                </Box>
              ) : (
                unsatisfied.map((c, i) => (
                  <Box
                    key={`${c.owner}-${c.type}-${i}`}
                    onClick={() =>
                      setCanvasState({
                        type: "SelectedElement",
                        elementID: c.owner,
                      })
                    }
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 0.5,
                      cursor: "pointer",
                      "&:hover": { backgroundColor: "action.selected" },
                    }}
                  >
                    <ElementDisplay
                      element={get_mechanical_element_from_id(
                        c.owner,
                        mechanism.mechanicalElements,
                      )}
                      setHoveredPart={setHoveredPart}
                      setCanvasState={setCanvasState}
                      applyActions={applyActions}
                      size={"small"}
                      editable={false}
                    ></ElementDisplay>
                    <WarningAmber fontSize="small" color="warning" />
                    <Typography variant="caption" color="text.secondary">
                      {CONSTRAINT_NOUN[c.type] ?? c.type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {`e = ${c.residual.toFixed(2)}`}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>
          </Box>

          <Divider />
        </>
      )}

      {/* Mesures sondes */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Sondes actives
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
          {probes.length === 0 && (
            <Typography variant="caption" color="text.disabled">
              Aucune sonde active
            </Typography>
          )}
          {probes.map((probe, index) => (
            <Chip
              key={index}
              label={probe}
              size="small"
              onDelete={() => removeProbe(index)}
              icon={<ShowChart fontSize="small" />}
            />
          ))}
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Add />}
          onClick={addProbe}
          fullWidth
        >
          Ajouter une mesure
        </Button>
      </Box>

      <Divider />

      {/* Graphiques placeholder */}
      <Box sx={{ mx: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Graphiques
        </Typography>
        <Box
          sx={{
            p: 2,
            borderRadius: 1,
            backgroundColor: "action.hover",
            textAlign: "center",
          }}
        >
          <Typography variant="caption" color="text.disabled">
            Les graphiques avancés arrivent en Phase 2
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default AnalysisPanel;
