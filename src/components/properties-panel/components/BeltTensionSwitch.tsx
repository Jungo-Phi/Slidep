/**
 * BeltTensionSwitch component
 * Read-only indicator of whether a belt is a closed loop.
 *
 * Closure is not a property one sets: it follows from the routing (enough
 * pulleys, both terminals on one junction). Joining the terminals closes the
 * belt, disconnecting them opens it — so this reports, it does not decide.
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import { icon } from "../../element-palette/iconDataUris";

interface BeltTensionSwitchProps {
  closed: boolean;
}

export const BeltTensionSwitch: React.FC<BeltTensionSwitchProps> = ({
  closed,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 0.5,
      }}
      title={
        closed
          ? "Les deux extrémités tiennent à une même jonction"
          : "Les extrémités sont libres"
      }
    >
      <Box
        sx={{
          display: "flex",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 0.5,
          opacity: 0.7,
        }}
      >
        <Box
          component="img"
          style={{ width: 28, height: 28 }}
          src={closed ? icon("tight-belt") : icon("loose-belt")}
        />
      </Box>
      <Typography variant="body2">{closed ? "Fermée" : "Libre"}</Typography>
    </Box>
  );
};

export default BeltTensionSwitch;
