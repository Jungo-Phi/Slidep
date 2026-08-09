/**
 * GroundSwitch component
 * Toggle switch for grounding/free state with visual indicator
 */

import React from "react";
import { Box, IconButton, Typography } from "@mui/material";
// Through `icon()`, never a direct asset import: a direct import hands back the
// raw file, which still carries the classic navy and stays navy on a dark canvas.
import { icon } from "../../element-palette/iconDataUris";
import { t } from "../../../i18n";

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
        sx={{ border: 1, borderColor: "divider" }}
        title={t(grounded ? "ground_release" : "ground_anchor")}
      >
        <Box
          component="img"
          style={{ width: 28, height: 28 }}
          src={icon(grounded ? "ground" : "unground")}
        />
      </IconButton>
      <Typography variant="body2">
        {t(grounded ? "ground_anchored" : "ground_free")}
      </Typography>
    </Box>
  );
};

export default GroundSwitch;
