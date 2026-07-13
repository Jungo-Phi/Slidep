import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import {
  Close,
  DeleteOutline,
  AccessTime,
  AddCircleOutline,
  Settings,
} from "@mui/icons-material";
import { SerializedMechanism } from "../../types";
import { format_date } from "../../utils";
import MechanismThumbnail from "./MechanismThumbnail";

interface MechanismsGalleryProps {
  open: boolean;
  onClose: () => void;
  mechanismRecords: SerializedMechanism[];
  onLoad: (mechanismRecord: SerializedMechanism) => void;
  onDelete: (createdAtId: number) => void;
  onNew: () => void;
}

export const MechanismsGallery: React.FC<MechanismsGalleryProps> = ({
  open,
  onClose,
  mechanismRecords,
  onLoad,
  onDelete,
  onNew,
}) => {
  // Trier par date de modification décroissante
  const sortedMechanismRecords = [...mechanismRecords].sort(
    (a, b) => b.metadata.modifiedAt - a.metadata.modifiedAt,
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          height: "85vh",
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
        }}
      >
        <Typography fontSize={"large"} fontWeight={500}>
          Mes mécanismes
        </Typography>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ bgcolor: "background.default", pt: 2 }}>
        <Grid container spacing={2}>
          {/* 1. Carte "Nouveau Mécanisme" (En première position) */}
          <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <Card
              onClick={onNew}
              sx={{
                height: "100%",
                minHeight: "375px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                border: "2px dashed",
                borderColor: "divider",
                bgcolor: "background.sunken",
                transition: "all 0.2s",
                "&:hover": {
                  borderColor: "primary.main",
                  bgcolor: "action.hover",
                  transform: "translateY(-2px)",
                },
              }}
            >
              <AddCircleOutline
                sx={{ fontSize: 48, color: "text.secondary", mb: 1 }}
              />
              <Typography variant="h6" color="text.secondary">
                Nouveau mécanisme
              </Typography>
            </Card>
          </Grid>

          {/* 2. Liste des mécanismes existants */}
          {sortedMechanismRecords.map((mechanismRecord) => {
            const elementCount = mechanismRecord.mechanicalElements.length;
            const hasTags =
              mechanismRecord.metadata.tags &&
              mechanismRecord.metadata.tags.length > 0;

            return (
              <Grid
                size={{ xs: 12, sm: 6, md: 4, lg: 3 }}
                key={mechanismRecord.metadata.createdAt}
              >
                <Tooltip title={mechanismRecord.metadata.description}>
                  <Card
                    onClick={() => onLoad(mechanismRecord)}
                    sx={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      cursor: "pointer",
                      transition: "transform 0.2s, box-shadow 0.2s",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: 6,
                        borderColor: "primary.main",
                      },
                      border: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    {/* Miniature, redessinée au thème courant */}
                    <MechanismThumbnail record={mechanismRecord} />

                    <Divider />

                    <CardContent sx={{ flexGrow: 1, p: 2 }}>
                      {/* Nom */}
                      <Box
                        display="flex"
                        flexDirection="row"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Typography
                          variant="h6"
                          noWrap
                          gutterBottom
                          fontWeight="600"
                        >
                          {mechanismRecord.metadata.name || "Sans titre"}
                        </Typography>
                        {/* Actions (Suppression) */}
                        <Tooltip title="Supprimer">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(mechanismRecord.metadata.createdAt);
                            }}
                          >
                            <DeleteOutline />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      {/* Date et Info éléments */}
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "flex-start",
                          gap: 2,
                          color: "text.secondary",
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                          }}
                        >
                          <AccessTime fontSize="small" />
                          <Typography variant="caption">
                            {format_date(mechanismRecord.metadata.modifiedAt)}
                          </Typography>
                        </Box>

                        {/* Compteur d'éléments */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            bgcolor: "background.sunken",
                            px: 1,
                            py: 0.2,
                            borderRadius: 1,
                          }}
                        >
                          <Settings fontSize="small" sx={{ fontSize: 14 }} />
                          <Typography variant="caption" fontWeight="600">
                            {elementCount} {"pièces"}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Tags (Affiché uniquement s'il y a des tags) */}
                      {hasTags && (
                        <>
                          <Divider sx={{ my: 1 }} />
                          <Box
                            sx={{
                              display: "flex",
                              gap: 0.5,
                              flexWrap: "wrap",
                            }}
                          >
                            {mechanismRecord.metadata.tags
                              .slice(0, 3)
                              .map((tag, idx) => (
                                <Chip
                                  key={idx}
                                  label={tag}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: "0.7rem" }}
                                />
                              ))}
                            {mechanismRecord.metadata.tags.length > 3 && (
                              <Typography
                                variant="caption"
                                sx={{
                                  alignSelf: "center",
                                  color: "text.secondary",
                                }}
                              >
                                +{mechanismRecord.metadata.tags.length - 3}
                              </Typography>
                            )}
                          </Box>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
            );
          })}
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

export default MechanismsGallery;
