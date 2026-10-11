import React, { useMemo } from "react";
import { Alert, AlertTitle, Box, Divider } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Action,
  CanvasState,
  ID,
  Mechanism,
  MechanismMetadata,
  UnionElement,
} from "../../../types";
import {
  compute_constraint_violations,
  ConstraintViolationCategory,
  validate_mechanism,
  ValidationErrorCode,
} from "../../../utils";
import { HoveredPart } from "../../../types/hovered-part";
import ElementDisplay from "../components/ElementDisplay";
import MechanismMetadataFields from "../../mechanisms-gallery/MechanismMetadataFields";
import { tn } from "../../../i18n";

/**
 * Categorical badge colors: they exist to tell the codes apart at a glance, not to carry a semantic role, so they are their own palette rather than theme tokens (the badges sit inside an Alert that already conveys error/warning).
 */
const ERROR_CODE_COLORS: Record<ValidationErrorCode, string> = {
  DUPLICATE_ID: "#B71C1C",
  DUPLICATE_IN_LIST: "#B71C1C",
  SELF_REFERENCE: "#880E4F",
  MISSING_REFERENCE: "#4527A0",
  WRONG_TYPE: "#6A1B9A",
  MISSING_BIDIRECTIONAL: "#004D40",
  SAME_AXLE_MESH: "#BF360C",
  CONTRADICTORY_MOTOR: "#3162AB",
  GROUNDED_MASS: "#AD1457",
  BELT_CLOSURE_MISMATCH: "#00695C",
  BELTS_JOINED: "#827717",
  LOADED_BELT_JUNCTION: "#4E6B1F",
  SUPERPOSED_EDGES: "#37474F",
  DUPLICATE_CONSTRAINT: "#5D4037",
  PARENT_BEAM_CONFLICT: "#2E7D32",
  GEAR_ROLE_CONFLICT: "#809d28",
};

const ERROR_CODE_LABELS: Record<ValidationErrorCode, string> = {
  DUPLICATE_ID: "dup",
  DUPLICATE_IN_LIST: "dup",
  SELF_REFERENCE: "ref",
  MISSING_REFERENCE: "ref",
  WRONG_TYPE: "typ",
  MISSING_BIDIRECTIONAL: "bdi",
  SAME_AXLE_MESH: "axl",
  CONTRADICTORY_MOTOR: "mot",
  GROUNDED_MASS: "anc",
  BELT_CLOSURE_MISMATCH: "crr",
  BELTS_JOINED: "cxc",
  LOADED_BELT_JUNCTION: "jnc",
  SUPERPOSED_EDGES: "sup",
  DUPLICATE_CONSTRAINT: "cnt",
  PARENT_BEAM_CONFLICT: "rai",
  GEAR_ROLE_CONFLICT: "grc",
};

const CATEGORY_COLORS: Record<ConstraintViolationCategory, string> = {
  dimension: "#1565C0",
  alignment: "#6A1B9A",
  geometric: "#00695C",
  liaison: "#E65100",
};

// Badges, not words: they stay the same in every language, the message beside them carries the meaning.
const CATEGORY_LABELS: Record<ConstraintViolationCategory, string> = {
  dimension: "dim",
  alignment: "ali",
  geometric: "geo",
  liaison: "lia",
};

interface ProjectInfoSectionProps {
  mechanism: Mechanism;
  updateMetadata: (metadata: MechanismMetadata) => void;
  /** Every tag already used in the mechanism library, suggested by the tag autocomplete. */
  allTags: string[];
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({
  mechanism,
  updateMetadata,
  allTags,
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions,
}) => {
  const validationErrors = useMemo(
    () => validate_mechanism(mechanism),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mechanism.mechanicalElements, mechanism.constraintElements],
  );

  // Names the element an error points at.
  // Every list is in it: an error can sit on a mechanical element, a constraint or a load.
  const elementByID = useMemo(
    () =>
      new Map<ID, UnionElement>(
        [
          ...mechanism.mechanicalElements,
          ...mechanism.constraintElements,
          ...mechanism.loads,
        ].map((el) => [el.id, el]),
      ),
    [
      mechanism.mechanicalElements,
      mechanism.constraintElements,
      mechanism.loads,
    ],
  );

  const constraintViolations = useMemo(
    () => compute_constraint_violations(mechanism),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mechanism.mechanicalElements, mechanism.constraintElements],
  );

  return (
    <Box sx={{ my: 2 }}>
      <Box sx={{ mx: 2 }}>
        <MechanismMetadataFields
          metadata={mechanism.metadata}
          onChange={updateMetadata}
          allTags={allTags}
          mechanismLength={mechanism.mechanicalElements.length}
        />
      </Box>

      {validationErrors !== null && (
        <>
          <Divider />
          <Alert
            severity="error"
            icon={false}
            sx={{
              py: 0.5,
              borderRadius: 0,
              border: "none",
              boxShadow: "none",
              mb: -2,
            }}
          >
            <AlertTitle
              sx={{
                fontSize: "0.85rem",
                mb: 0.5,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <ErrorOutlineIcon fontSize="small" />
              {tn("project_errors", validationErrors.length)}
            </AlertTitle>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              {validationErrors.map((err, i) => {
                const faulty = err.elementID
                  ? elementByID.get(err.elementID)
                  : undefined;
                return (
                  <Box
                    key={i}
                    sx={{
                      fontSize: "0.72rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        px: 0.5,
                        py: "1px",
                        borderRadius: "3px",
                        bgcolor: ERROR_CODE_COLORS[err.code],
                        color: "common.white",
                        flexShrink: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {ERROR_CODE_LABELS[err.code]}
                    </Box>
                    {faulty && (
                      <Box sx={{ flexShrink: 0 }}>
                        <ElementDisplay
                          element={faulty}
                          hoveredPart={hoveredPart}
                          setHoveredPart={setHoveredPart}
                          selectedIds={selectedIds}
                          setCanvasState={setCanvasState}
                          applyActions={applyActions}
                          size="small"
                          editable={false}
                        />
                      </Box>
                    )}
                    {err.message}
                  </Box>
                );
              })}
            </Box>
          </Alert>
        </>
      )}

      {constraintViolations !== null && (
        <>
          <Divider />
          <Alert
            severity="warning"
            icon={false}
            sx={{
              py: 0.5,
              borderRadius: 0,
              border: "none",
              boxShadow: "none",
              mb: -2,
            }}
          >
            <AlertTitle
              sx={{
                fontSize: "0.85rem",
                mb: 0.5,
                display: "flex",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <WarningAmberIcon fontSize="small" />
              {tn("project_violations", constraintViolations.length)}
            </AlertTitle>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
              {constraintViolations.map((v, i) => (
                <Box
                  key={i}
                  sx={{
                    fontSize: "0.72rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      px: 0.5,
                      py: "1px",
                      borderRadius: "3px",
                      bgcolor: CATEGORY_COLORS[v.category],
                      color: "common.white",
                      flexShrink: 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {CATEGORY_LABELS[v.category]}
                  </Box>
                  {v.message}
                </Box>
              ))}
            </Box>
          </Alert>
        </>
      )}
    </Box>
  );
};

export default ProjectInfoSection;
