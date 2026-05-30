/**
 * BeltTensionSwitch component
 * Toggle switch for tensionning a belt with visual indicator
 */

import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
import looseBeltIconUrl from "../../../assets/icons/palette/loose-belt.svg";
import tightBeltIconUrl from "../../../assets/icons/palette/tight-belt.svg";

interface BeltTensionSwitchProps {
  tightened: boolean;
  setTight: (tight: boolean) => void;
}

export const BeltTensionSwitch: React.FC<BeltTensionSwitchProps> = ({
  tightened,
  setTight,
}) => {
  const toggleTight = () => {
    setTight(!tightened);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      <IconButton
        onClick={toggleTight}
        size="small"
        sx={{ border: 1, borderColor: "#00000020" }}
        title={tightened ? "Libérer la courroie" : "Tendre la courroie"}
      >
        <Box
          component="img"
          src={tightened ? tightBeltIconUrl : looseBeltIconUrl}
          style={{ width: 28, height: 28 }}
        />
      </IconButton>
      <Typography variant="body2">{tightened ? "Tendue" : "Libre"}</Typography>
    </Box>
  );
};

export default BeltTensionSwitch;
