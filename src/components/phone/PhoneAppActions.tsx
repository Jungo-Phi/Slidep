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

/** The app's own settings, language and about, which a phone's top bar leaves to the gallery's header. */
export const PhoneAppActions: React.FC<PhoneAppActionsProps> = ({
  language,
  onSelectLang,
  onOpenAbout,
  ...settings
}) => (
  <>
    <SettingsMenu {...settings} />
    <LanguageMenu language={language} onSelectLang={onSelectLang} />
    <IconButton
      color="inherit"
      size="small"
      aria-label={t("about")}
      onClick={onOpenAbout}
    >
      <InfoOutlined sx={{ fontSize: 20 }} />
    </IconButton>
  </>
);
