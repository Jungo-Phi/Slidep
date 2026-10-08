import React from "react";
import { Box, useTheme } from "@mui/material";
import { icon, icon_faded } from "../../element-palette/iconDataUris";

/** A toggle's icon: its `on` glyph as drawn, its `off` sibling in the colour of an overlay eye that is off (the theme's `text.disabled`). */
export const ToggleIcon: React.FC<{
  on: boolean;
  onName: string;
  offName: string;
  size?: number;
}> = ({ on, onName, offName, size = 28 }) => {
  const offColor = useTheme().palette.text.disabled;
  const { src, opacity } = on
    ? { src: icon(onName), opacity: 1 }
    : icon_faded(offName, offColor);
  return (
    <Box
      component="img"
      style={{ width: size, height: size, opacity }}
      src={src}
    />
  );
};

export default ToggleIcon;
