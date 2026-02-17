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
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Typography variant="body2">{tightened ? "Tight" : "Loose"}</Typography>
      <IconButton
        onClick={toggleTight}
        size="small"
        sx={{ border: 1, borderColor: "#00000020" }}
      >
        <img
          src={tightened ? tightBeltIconUrl : looseBeltIconUrl}
          alt={tightened ? "Tight belt" : "loose belt"}
          style={{ width: 28, height: 28 }}
        />
      </IconButton>
    </Box>
  );
};

export default BeltTensionSwitch;
