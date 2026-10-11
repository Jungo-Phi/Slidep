import React, { useState } from "react";
import { IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { Language } from "@mui/icons-material";
import { Lang, LANGUAGE_LABELS, LANGUAGES, t } from "../../i18n";
import { useNonModalPopup } from "../common/use-non-modal-popup";

interface LanguageMenuProps {
  language: Lang;
  onSelectLang: (lang: Lang) => void;
  /** Opens the menu from elsewhere, on that anchor, with no button of its own; `onClose` must then come with it. */
  anchorEl?: HTMLElement | null;
  onClose?: () => void;
}

/** The toolbar's language picker: current code as the button label, full names in the menu. */
export const LanguageMenu: React.FC<LanguageMenuProps> = ({
  language,
  onSelectLang,
  anchorEl: outerAnchor,
  onClose,
}) => {
  const [ownAnchor, setOwnAnchor] = useState<null | HTMLElement>(null);
  const controlled = onClose !== undefined;
  const anchorEl = controlled ? (outerAnchor ?? null) : ownAnchor;
  const close = controlled ? onClose : () => setOwnAnchor(null);
  const open = !!anchorEl;
  const popup = useNonModalPopup(open, anchorEl, close);

  return (
    <>
      {!controlled && (
        <Tooltip title={t("language")}>
          <IconButton
            color="inherit"
            size="small"
            aria-expanded={open}
            onClick={(event) => {
              const button = event.currentTarget;
              setOwnAnchor((current) => (current ? null : button));
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
      )}
      <Menu
        {...popup}
        anchorEl={anchorEl}
        open={open}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {LANGUAGES.map((lang) => (
          <MenuItem
            key={lang}
            selected={lang === language}
            onClick={() => {
              onSelectLang(lang);
              close();
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
