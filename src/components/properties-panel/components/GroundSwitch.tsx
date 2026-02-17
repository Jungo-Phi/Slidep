/**
 * GroundSwitch component
 * Toggle switch for grounding/free state with visual indicator
 */

import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
import groundIconUrl from "../../../assets/icons/palette/ground.svg";
import ungroundIconUrl from "../../../assets/icons/palette/unground.svg";

interface GroundSwitchProps {
  grounded: boolean;
  setGround: (grounded: boolean) => void;
}

export const GroundSwitch: React.FC<GroundSwitchProps> = ({
  grounded,
  setGround,
}) => {
  const toggleGround = () => {
    setGround(!grounded);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Typography variant="body2">{grounded ? "Grounded" : "Free"}</Typography>
      <IconButton
        onClick={toggleGround}
        size="small"
        sx={{ border: 1, borderColor: "#00000020" }}
      >
        <img
          src={grounded ? groundIconUrl : ungroundIconUrl}
          alt={grounded ? "Grounded" : "Free"}
        />
      </IconButton>
    </Box>
  );
};

export default GroundSwitch;
