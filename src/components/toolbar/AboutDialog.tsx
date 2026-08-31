import React from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link as MuiLink,
  Typography,
} from "@mui/material";
import { Bolt, Close, CloudOff, Lock } from "@mui/icons-material";
import { t } from "../../i18n";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export const AboutDialog: React.FC<AboutDialogProps> = ({ open, onClose }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle fontSize={"large"}>{t("title")}</DialogTitle>
    <IconButton
      onClick={onClose}
      sx={() => ({
        position: "absolute",
        right: 8,
        top: 8,
      })}
    >
      <Close />
    </IconButton>
    <DialogContent dividers>
      <Typography gutterBottom>{t("intro")}</Typography>

      <Typography gutterBottom>{t("story")}</Typography>

      <Typography>{t("roadmap")}</Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
          gap: 2,
          mt: 3,
        }}
      >
        {[
          {
            icon: <Bolt sx={{ fontSize: 20 }} />,
            title: t("realtime_title"),
            body: t("realtime_body"),
          },
          {
            icon: <CloudOff sx={{ fontSize: 20 }} />,
            title: t("offline_title"),
            body: t("offline_body"),
          },
          {
            icon: <Lock sx={{ fontSize: 20 }} />,
            title: t("local_title"),
            body: t("local_body"),
          },
        ].map((feature) => (
          <Box key={feature.title}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                color: "primary.main",
                mb: 0.25,
              }}
            >
              {feature.icon}
              <Typography variant="subtitle2" color="text.primary">
                {feature.title}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {feature.body}
            </Typography>
          </Box>
        ))}
      </Box>

      <Typography sx={{ mt: 3 }}>{t("contribute")}</Typography>
    </DialogContent>
    <DialogContent>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          columnGap: 2,
          rowGap: 0.75,
          alignItems: "baseline",
          fontSize: "0.875rem",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t("version")}
        </Typography>
        <Typography variant="body2">{__APP_VERSION__}</Typography>

        <Typography variant="body2" color="text.secondary">
          {t("license")}
        </Typography>
        <Typography variant="body2">{t("license_tbd")}</Typography>

        <Typography variant="body2" color="text.secondary">
          {t("contact")}
        </Typography>
        <MuiLink
          variant="body2"
          href="mailto:arnaud.jungo@slidep.ch"
          sx={{ justifySelf: "start" }}
        >
          arnaud.jungo@slidep.ch
        </MuiLink>

        <Typography variant="body2" color="text.secondary">
          {t("code")}
        </Typography>
        <MuiLink
          variant="body2"
          href="https://github.com/Jungo-Phi/Slidep"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ justifySelf: "start" }}
        >
          github.com/Jungo-Phi/Slidep
        </MuiLink>
      </Box>
    </DialogContent>
  </Dialog>
);
