/**
 * ElementProperties component Displays properties for element elements
 */

import { Box, IconButton, List, ListItem, Tooltip } from "@mui/material";
import { Delete } from "@mui/icons-material";
import { ConstraintElement, ID } from "../../../types/element";
import { CanvasState, Action, Mechanism, ZERO } from "../../../types";
import { HoveredPart } from "../../../types/hovered-part";
import NumberInput from "../components/NumberInput";
import ElementDisplay from "../components/ElementDisplay";
import StructureOnly from "../components/StructureOnly";
import React from "react";
import RatioInput from "../components/RatioInput";
import SectionTitle from "../components/SectionTitle";
import {
  element_to_hovered_part,
  is_geometric_constraint_type,
} from "../../canvas/utils";
import { sorted_constraints_for_display } from "../element-order";
import { t } from "../../../i18n";
import { ANGLE, LENGTH } from "../../../utils/quantity-format";
import { useRowArrows } from "../../common/keyboard-zones";

interface ConstraintsPanelProps {
  hoveredPart: HoveredPart;
  setHoveredPart: (hoveredPart: HoveredPart) => void;
  selectedIds: ID[];
  setCanvasState: (state: CanvasState) => void;
  applyActions: (actions: Action[]) => void;
  mechanism: Mechanism;
}

export const ConstraintsPanel: React.FC<ConstraintsPanelProps> = ({
  hoveredPart,
  setHoveredPart,
  selectedIds,
  setCanvasState,
  applyActions: applyActions,
  mechanism,
}) => {
  // The up and down arrows run down both lists as one, a value to the next value, a name to the next name.
  const listsRef = React.useRef<HTMLDivElement>(null);
  useRowArrows(listsRef, "li");

  const handleMouseEnter = (constraint: ConstraintElement) => {
    setHoveredPart(element_to_hovered_part(constraint, true));
  };

  const handleMouseLeave = () => {
    setHoveredPart({ type: "Void", position: ZERO });
  };

  // Dimensions carry a value and their own on-canvas position; the geometric constraints (align/normal/parallel/equal) carry neither — split into two groups rather than one list mixing an editable number with a bare delete.
  const dimensions = sorted_constraints_for_display(
    mechanism.constraintElements.filter(
      (c) => !is_geometric_constraint_type(c.type),
    ),
  );
  const geometrics = sorted_constraints_for_display(
    mechanism.constraintElements.filter((c) =>
      is_geometric_constraint_type(c.type),
    ),
  );

  const renderRow = (constraint: ConstraintElement) => (
    <React.Fragment key={constraint.id}>
      <ListItem disablePadding>
        <ElementDisplay
          element={constraint}
          hoveredPart={hoveredPart}
          setHoveredPart={setHoveredPart}
          selectedIds={selectedIds}
          setCanvasState={setCanvasState}
          applyActions={applyActions}
          size="medium"
          editable={true}
          trailingControls={
            <StructureOnly
              actions={[
                "ChangeDimensionEdgeValue",
                "ChangeGearRatioValue",
                "DeleteElement",
              ]}
              row
            >
              {(() => {
                switch (constraint.type) {
                  case "dimension-edge":
                  case "dimension-node-to-node":
                  case "dimension-edge-to-node":
                  case "dimension-angle":
                  case "dimension-radius":
                  case "dimension-belt": {
                    const isAngle = constraint.type === "dimension-angle";

                    let title = t("distance");
                    let label = "L";
                    if (constraint.type === "dimension-angle") {
                      title = t("angle");
                      label = "α";
                    }
                    if (constraint.type === "dimension-radius") {
                      title = t("radius");
                      label = "R";
                    }
                    if (
                      constraint.type === "dimension-edge" ||
                      constraint.type === "dimension-belt"
                    )
                      title = t("length");
                    return (
                      <NumberInput
                        label={label}
                        title={title}
                        value={constraint.value}
                        onChange={(value: number) =>
                          applyActions([
                            {
                              type: "ChangeDimensionEdgeValue",
                              id: constraint.id,
                              newValue: value,
                              oldValue: constraint.value,
                            },
                          ])
                        }
                        kind={isAngle ? ANGLE : LENGTH}
                        unsigned
                      />
                    );
                  }
                  case "gear-ratio":
                    return (
                      <RatioInput
                        value={constraint.value}
                        onChange={(value: number) =>
                          applyActions([
                            {
                              type: "ChangeGearRatioValue",
                              id: constraint.id,
                              newValue: value,
                              oldValue: constraint.value,
                            },
                          ])
                        }
                      />
                    );
                }
              })()}
              <Tooltip title={t("delete")}>
                <IconButton
                  color="error"
                  onMouseEnter={() => handleMouseEnter(constraint)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() =>
                    applyActions([
                      { type: "DeleteElement", element: constraint },
                    ])
                  }
                  sx={{ borderRadius: 3 }}
                >
                  <Delete sx={{ width: 20, height: 20 }} />
                </IconButton>
              </Tooltip>
            </StructureOnly>
          }
        />
      </ListItem>
    </React.Fragment>
  );

  const renderBlock = (
    title: string,
    constraints: ConstraintElement[],
    emptyLabel: string,
  ) => (
    <>
    <SectionTitle sx={{ pl: 3, pt: 2, mb: -1.5 }}>{title}</SectionTitle>
    <Box
      sx={{
        borderRadius: 3,
        margin: 2,
        backgroundColor: "background.sunken",
      }}
    >
      {constraints.length > 0 ? (
        <List
          disablePadding
          sx={{
            display: "flex",
            alignItems: "center",
            flexDirection: "column",
            width: "100%",
          }}
        >
          {constraints.map(renderRow)}
        </List>
      ) : (
        <Box
          sx={{
            padding: 2,
            textAlign: "center",
            fontSize: "0.875rem",
            color: "text.disabled",
          }}
        >
          {emptyLabel}
        </Box>
      )}
    </Box>
    </>
  );

  return (
    // No box of its own: the blocks lay out as the panel's children.
    <Box ref={listsRef} sx={{ display: "contents" }}>
      {renderBlock(t("dimensions_section"), dimensions, t("dimensions_empty"))}
      {renderBlock(
        t("geometric_constraints_section"),
        geometrics,
        t("constraints_empty"),
      )}
    </Box>
  );
};

export default ConstraintsPanel;
