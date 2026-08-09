import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Divider,
  TextField,
  Typography,
} from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Action,
  ActionBundleType,
  CanvasState,
  ID,
  Mechanism,
  MechanismMetadata,
  UnionElement,
} from "../../types";
import {
  compute_constraint_violations,
  ConstraintViolationCategory,
  format_date,
  validate_mechanism,
  ValidationErrorCode,
} from "../../utils";
import { HoveredPart } from "../../types/hovered-part";
import ElementDisplay from "./components/ElementDisplay";
import { t, tn } from "../../i18n";

/**
 * Categorical badge colors: they exist to tell the codes apart at a glance, not
 * to carry a semantic role, so they are their own palette rather than theme
 * tokens (the badges sit inside an Alert that already conveys error/warning).
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
  SUPERPOSED_EDGES: "#37474F",
  DUPLICATE_CONSTRAINT: "#5D4037",
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
  SUPERPOSED_EDGES: "sup",
  DUPLICATE_CONSTRAINT: "cnt",
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
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[], actionBundleType: ActionBundleType) => void;
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({
  mechanism,
  updateMetadata,
  setHoveredPart,
  setCanvasState,
  applyActions,
}) => {
  const validationErrors = useMemo(
    () => validate_mechanism(mechanism),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mechanism.mechanicalElements, mechanism.constraintElements],
  );

  // Names the element an error points at. Every list is in it: an error can sit on a mechanical element, a constraint or a load.
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

  const [projectInfo, setProjectInfo] = useState<MechanismMetadata>({
    name: mechanism.metadata.name,
    description: mechanism.metadata.description,
    author: mechanism.metadata.author,
    createdAt: mechanism.metadata.createdAt,
    modifiedAt: mechanism.metadata.modifiedAt,
    tags: mechanism.metadata.tags,
    lastSimulationMode: mechanism.metadata.lastSimulationMode,
  });

  useEffect(() => {
    setProjectInfo({
      name: mechanism.metadata.name,
      description: mechanism.metadata.description,
      author: mechanism.metadata.author,
      createdAt: mechanism.metadata.createdAt,
      modifiedAt: mechanism.metadata.modifiedAt,
      tags: mechanism.metadata.tags,
      lastSimulationMode: mechanism.metadata.lastSimulationMode,
    });
  }, [mechanism.metadata]);

  const handleInfoChange = (field: keyof MechanismMetadata, value: string) => {
    setProjectInfo((previous) => ({ ...previous, [field]: value }));
  };

  // Set by Escape so the blur it triggers discards instead of committing.
  const discardRef = useRef(false);

  // Leaving a field validates it. Metadata does not go through the history, so Escape is
  // the only way back from an edit and has to restore rather than merely leave.
  const commitInfo = () => {
    if (discardRef.current) {
      discardRef.current = false;
      setProjectInfo({ ...mechanism.metadata });
      return;
    }
    const { name, description, author } = mechanism.metadata;
    if (
      projectInfo.name === name &&
      projectInfo.description === description &&
      projectInfo.author === author
    )
      return;
    updateMetadata({ ...projectInfo });
  };

  /** `enterCommits` is off for the description, where Enter is a line break. */
  const handleFieldKeyDown = (
    e: React.KeyboardEvent,
    enterCommits: boolean,
  ) => {
    if (e.key === "Escape") {
      discardRef.current = true;
      (e.target as HTMLElement).blur();
    } else if (e.key === "Enter" && enterCommits) {
      (e.target as HTMLElement).blur();
    }
  };

  return (
    <Box sx={{ my: 2 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          mx: 2,
        }}
      >
        <TextField
          fullWidth
          label={t("project_title")}
          value={projectInfo.name}
          onChange={(e) => handleInfoChange("name", e.target.value)}
          onKeyDown={(e) => handleFieldKeyDown(e, true)}
          onBlur={commitInfo}
          size="small"
        />

        <TextField
          fullWidth
          label={t("project_description")}
          multiline
          rows={4.6}
          value={projectInfo.description}
          onChange={(e) => handleInfoChange("description", e.target.value)}
          onKeyDown={(e) => handleFieldKeyDown(e, false)}
          onBlur={commitInfo}
          size="small"
          sx={{
            "& .MuiOutlinedInput-root": {
              paddingRight: 0,
            },
            "& .MuiInputBase-input": {
              fontSize: "0.86rem",
              paddingRight: "10px",
            },
          }}
        />

        <TextField
          fullWidth
          label={t("project_author")}
          value={projectInfo.author}
          onChange={(e) => handleInfoChange("author", e.target.value)}
          onKeyDown={(e) => handleFieldKeyDown(e, true)}
          onBlur={commitInfo}
          size="small"
        />
      </Box>

      <Box
        sx={{
          m: 2,
          display: "flex",
          gap: 4,
        }}
      >
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            {t("project_created")}
          </Typography>
          <Typography variant="body2">
            {format_date(projectInfo.createdAt)}
          </Typography>
        </Box>
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            {t("project_modified")}
          </Typography>
          <Typography variant="body2">
            {format_date(projectInfo.modifiedAt)}
          </Typography>
        </Box>
      </Box>

      <Divider />

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          m: 2,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography variant="body2">{t("project_element_count")}</Typography>
          <Typography variant="body1" fontWeight={500}>
            {mechanism.mechanicalElements.length}
          </Typography>
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <Typography variant="body2">
            {t("project_constraint_count")}
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {mechanism.constraintElements.length}
          </Typography>
        </Box>
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
                          setHoveredPart={setHoveredPart}
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
