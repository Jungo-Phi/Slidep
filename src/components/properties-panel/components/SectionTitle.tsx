import React from "react";
import { SxProps, Theme, Typography } from "@mui/material";

/** The title over one section of a panel's page, read the way the library tab names its own. */
export const SectionTitle: React.FC<{
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}> = ({ children, sx }) => (
  <Typography
    variant="subtitle2"
    fontWeight={600}
    noWrap
    sx={[{ px: 2, mb: 0.5 }, ...(Array.isArray(sx) ? sx : [sx])]}
  >
    {children}
  </Typography>
);

export default SectionTitle;
