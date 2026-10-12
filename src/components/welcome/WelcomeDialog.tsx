import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { InstallDesktop, InstallMobile, Lock } from "@mui/icons-material";
import { t } from "../../i18n";
import { usePhoneLayout } from "../phone/use-phone-layout";
import { is_ios, useInstallRoute } from "./install-route";

interface WelcomeDialogProps {
  open: boolean;
  onClose: () => void;
}

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <Box sx={{ mt: 2.5 }}>
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        color: "primary.main",
        mb: 0.5,
      }}
    >
      {icon}
      <Typography variant="subtitle1" color="text.primary" fontWeight={700}>
        {title}
      </Typography>
    </Box>
    {children}
  </Box>
);

/**
 * What a first visit needs to hear before anything is built: how to install the app, and where the mechanisms are kept.
 * Shown once on the first launch, on desktop as on a phone; the About dialog opens it again.
 */
export const WelcomeDialog: React.FC<WelcomeDialogProps> = ({
  open,
  onClose,
}) => {
  const phone = usePhoneLayout();
  const route = useInstallRoute();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={phone}
    >
      <DialogTitle fontSize="large">{t("welcome_title")}</DialogTitle>
      <DialogContent dividers>
        <Typography>{t("intro")}</Typography>

        {route && (
          <Section
            icon={phone ? <InstallMobile /> : <InstallDesktop />}
            title={t("welcome_install_title")}
          >
            <Typography variant="body2" color="text.secondary">
              {t("welcome_install_body")}
            </Typography>
            {is_ios() && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("welcome_install_ios_storage")}
              </Typography>
            )}
            {route.kind === "prompt" ? (
              <Button variant="outlined" onClick={route.install} sx={{ mt: 1.5 }}>
                {t("welcome_install_button")}
              </Button>
            ) : (
              <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
                {t(route.stepsKey)}
              </Typography>
            )}
          </Section>
        )}

        <Section icon={<Lock />} title={t("welcome_storage_title")}>
          <Typography variant="body2" color="text.secondary">
            {t("welcome_storage_body")}
          </Typography>
        </Section>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button variant="contained" onClick={onClose}>
          {t("welcome_start")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
