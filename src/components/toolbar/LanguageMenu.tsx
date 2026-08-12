import React, { useState } from "react";
import { IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { Language } from "@mui/icons-material";
import { Lang, LANGUAGE_LABELS, LANGUAGES, t } from "../../i18n";

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

  return (
    <>
      <Tooltip disableInteractive title={t("toolbar_language")}>
        <IconButton
          color="inherit"
          size="small"
          aria-expanded={open}
          onClick={(event) => setAnchorEl(event.currentTarget)}
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
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
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
