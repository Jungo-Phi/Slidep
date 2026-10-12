import React from "react";
import { IconButton } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { t } from "../../i18n";
import { LanguageMenu } from "../toolbar/LanguageMenu";
import { SettingsMenu } from "../toolbar/SettingsMenu";

type PhoneAppActionsProps = React.ComponentProps<typeof SettingsMenu> &
  React.ComponentProps<typeof LanguageMenu> & {
    onOpenAbout: () => void;
  };

/** The app's own settings, language and about, which a phone's top bar leaves to the gallery's header — at the size of the ⋮ beside them. */
export const PhoneAppActions: React.FC<PhoneAppActionsProps> = ({
  language,
  onSelectLang,
  onOpenAbout,
  ...settings
}) => (
  <>
    <SettingsMenu {...settings} large />
    <LanguageMenu language={language} onSelectLang={onSelectLang} large />
    <IconButton color="inherit" aria-label={t("about")} onClick={onOpenAbout}>
      <InfoOutlined />
    </IconButton>
  </>
);
