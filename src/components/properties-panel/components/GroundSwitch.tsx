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
        flexDirection: "row",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      <IconButton
        onClick={toggleGround}
        size="small"
        sx={{ border: 1, borderColor: "#00000020" }}
        title={grounded ? "Libérer" : "Ancrer"}
      >
        <Box
          component="img"
          style={{ width: 28, height: 28 }}
          src={grounded ? groundIconUrl : ungroundIconUrl}
        />
      </IconButton>
      <Typography variant="body2">{grounded ? "Ancré" : "Libre"}</Typography>
    </Box>
  );
};

export default GroundSwitch;
