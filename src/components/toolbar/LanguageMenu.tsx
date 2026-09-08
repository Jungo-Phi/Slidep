import React, { useState } from "react";
import { IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { Language } from "@mui/icons-material";
import { Lang, LANGUAGE_LABELS, LANGUAGES, t } from "../../i18n";
import { useNonModalPopup } from "../common/use-non-modal-popup";

interface LanguageMenuProps {
  language: Lang;
  onSelectLang: (lang: Lang) => void;
}

/** The toolbar's language picker: current code as the button label, full names in the menu. */
export const LanguageMenu: React.FC<LanguageMenuProps> = ({
  language,
  onSelectLang,
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = !!anchorEl;
  const popup = useNonModalPopup(open, anchorEl, () => setAnchorEl(null));

  return (
    <>
      <Tooltip title={t("language")}>
        <IconButton
          color="inherit"
          size="small"
          aria-expanded={open}
          onClick={(event) => {
            const button = event.currentTarget;
            setAnchorEl((current) => (current ? null : button));
          }}
          sx={{
            gap: 0.4,
            fontSize: "0.72rem",
            fontWeight: 700,
            px: 0.75,
          }}
        >
          <Language sx={{ fontSize: 20 }} />
          {language.toUpperCase()}
        </IconButton>
      </Tooltip>
      <Menu
        {...popup}
        anchorEl={anchorEl}
        open={open}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { style: { maxHeight: 175 } } }}
      >
        {LANGUAGES.map((lang) => (
          <MenuItem
            key={lang}
            selected={lang === language}
            onClick={() => {
              onSelectLang(lang);
              setAnchorEl(null);
            }}
            disableRipple
          >
            {LANGUAGE_LABELS[lang]}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
