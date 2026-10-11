import React from "react";
import { Box, ButtonBase, Collapse, Typography } from "@mui/material";
import { KeyboardArrowDown } from "@mui/icons-material";
import { getStorageItem, setStorageItem } from "../../../utils/storage";

interface CollapsibleSectionProps {
  /** Where the section remembers being folded, across tabs and sessions. */
  storageKey: string;
  title: React.ReactNode;
  /** Controls on the title's line that stay within reach folded or not — a switch, a caveat. */
  trailing?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * One section of the analysis tab, folded and unfolded from its title: the tab reads several things about the mechanism at once, and a reader keeps open the ones they are following.
 * Unfolded the first time, and remembered from then on.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  storageKey,
  title,
  trailing,
  children,
}) => {
  const [open, setOpen] = React.useState(() =>
    getStorageItem<boolean>(storageKey, true),
  );
  React.useEffect(() => {
    setStorageItem(storageKey, open);
  }, [storageKey, open]);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minHeight: 26 }}>
        <ButtonBase
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          sx={{
            flex: 1,
            minWidth: 0,
            justifyContent: "flex-start",
            gap: 0.25,
            ml: -0.5,
            borderRadius: 1,
          }}
        >
          <KeyboardArrowDown
            fontSize="small"
            sx={{
              color: "text.secondary",
              transform: open ? "none" : "rotate(-90deg)",
              transition: "transform 0.15s",
            }}
          />
          <Typography variant="subtitle2" fontWeight={600} noWrap>
            {title}
          </Typography>
        </ButtonBase>
        {trailing}
      </Box>
      <Collapse in={open} unmountOnExit>
        {children}
      </Collapse>
    </Box>
  );
};

export default CollapsibleSection;
