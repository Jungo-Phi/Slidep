import { SxProps, Theme } from "@mui/material";

/**
 * For a `standard`-variant `TextField` with `disableUnderline`: no border at rest, a plain
 * background fill on focus instead of the underline. Shared by every inline text edit in the
 * gallery (search, tag entry, name rename) so they read as one family of input.
 */
export const INLINE_INPUT_SX: SxProps<Theme> = {
  px: 0.5,
  borderRadius: 1,
  transition: "background-color 0.15s",
  "&:focus-within": { bgcolor: "primary.contrastText" },
  // The standard variant pads 4px above and 5px below by default, to leave room for the
  // underline. That asymmetry goes unnoticed with the underline as an anchor, but reads as
  // off-center text once `disableUnderline` removes it.
  "& .MuiInputBase-input": { paddingTop: "4px", paddingBottom: "4px" },
};
