import React, { useEffect, useState } from "react";
import { Box, Fade, IconButton, Popper, Typography, keyframes } from "@mui/material";
import { Check, Close } from "@mui/icons-material";
import { t } from "../../i18n";
import {
  HINT_IDLE_MS,
  HINT_ORDER,
  HINTS,
  HintId,
  dismiss_hint,
  hint_resolved,
  usePendingHints,
  useReportedSituations,
} from "./hints";
import { useIdle } from "./use-idle";

/** How often the control a shown hint points at is looked for again: it may mount, move or hide with the layout. */
const ANCHOR_REFRESH_MS = 500;

/** How long a bubble stays up to say its hint was done, before fading out. */
const CELEBRATE_MS = 1200;

const FADE_MS = 250;

const ARROW = 8;

/** The outline that sets the bubble apart from the panels and bars it overlaps, drawn in the colour of its text. */
const BORDER = 2;

/** The arrow is drawn scaled down: its outline is drawn thicker by as much, to match the bubble's. */
const ARROW_SCALE = 0.7;

/** The bubble swells once and settles: the step was taken. */
const pop = keyframes`
  0% { transform: scale(1); }
  35% { transform: scale(1.15); }
  100% { transform: scale(1); }
`;

/** The control `anchor` names, if one is on screen. */
function find_anchor(anchor: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(
    `[data-hint-anchor="${anchor}"]`,
  ))
    if (element.getClientRects().length > 0) return element;
  return null;
}

/**
 * Where the bubble on screen stands.
 * - `showing`: waiting for its action.
 * - `celebrating`: its action was just done, which it says before going.
 * - `leaving`: fading out.
 */
type Phase = "showing" | "celebrating" | "leaving";

interface HintLayerProps {
  /** The hints whose situation holds right now: one shows once the user has been idle for `HINT_IDLE_MS`. */
  eligible: Partial<Record<HintId, boolean>>;
}

/**
 * Shows at most one hint at a time, next to the control it points at.
 * Once shown, it stays until it is consumed — by its action, or by its close button — whatever the user does meanwhile: it must still be there when the pointer reaches what it shows.
 */
export const HintLayer: React.FC<HintLayerProps> = ({ eligible }) => {
  const pending = usePendingHints();
  const idle = useIdle(HINT_IDLE_MS);
  const [shown, setShown] = useState<{ id: HintId; phase: Phase } | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [arrow, setArrow] = useState<HTMLElement | null>(null);

  const reported = useReportedSituations();
  const eligibleKey = HINT_ORDER.filter(
    (id) => eligible[id] || reported.includes(id),
  ).join(",");
  const pendingKey = pending.join(",");
  useEffect(() => {
    if (shown) {
      if (shown.phase === "showing" && !pending.includes(shown.id))
        setShown({
          id: shown.id,
          phase: hint_resolved(shown.id) ? "celebrating" : "leaving",
        });
      return;
    }
    if (!idle) return;
    const next = pending.find((id) => eligibleKey.split(",").includes(id));
    if (next) setShown({ id: next, phase: "showing" });
    // `pendingKey` stands for `pending`, which is a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idle, shown, pendingKey, eligibleKey]);

  useEffect(() => {
    if (shown?.phase !== "celebrating") return;
    const timer = setTimeout(
      () => setShown({ id: shown.id, phase: "leaving" }),
      CELEBRATE_MS,
    );
    return () => clearTimeout(timer);
  }, [shown]);

  const id = shown?.id;
  useEffect(() => {
    if (!id) {
      setAnchor(null);
      return;
    }
    const refresh = () => setAnchor(find_anchor(HINTS[id].anchor));
    refresh();
    const timer = setInterval(refresh, ANCHOR_REFRESH_MS);
    return () => clearInterval(timer);
  }, [id]);

  // With its control gone, there is no fade to wait for.
  useEffect(() => {
    if (shown?.phase === "leaving" && anchor === null) setShown(null);
  }, [shown, anchor]);

  if (!shown) return null;
  // A bubble closed by its button only fades: the green and the swell are for an action taken.
  const done =
    shown.phase === "celebrating" ||
    (shown.phase === "leaving" && hint_resolved(shown.id));
  return (
    <Popper
      open={anchor !== null && shown.phase !== "leaving"}
      anchorEl={anchor}
      placement={HINTS[shown.id].placement}
      transition
      modifiers={[
        { name: "offset", options: { offset: [0, ARROW + BORDER + 4] } },
        { name: "arrow", enabled: true, options: { element: arrow } },
        // A control along an edge of the screen has no room on its far side: above or below it then, never off screen.
        { name: "flip", options: { fallbackPlacements: ["top", "bottom"] } },
      ]}
      sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
    >
      {({ TransitionProps }) => (
        <Fade
          {...TransitionProps}
          timeout={FADE_MS}
          onExited={() => {
            TransitionProps?.onExited();
            if (shown.phase === "leaving") setShown(null);
          }}
        >
          <Box
            role="status"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              pl: 1.5,
              pr: 0.5,
              py: 0.5,
              maxWidth: 300,
              borderRadius: 1.5,
              border: `${BORDER}px solid`,
              borderColor: "currentColor",
              bgcolor: done ? "success.main" : "primary.main",
              color: done ? "success.contrastText" : "primary.contrastText",
              boxShadow: 4,
              transition: `background-color ${FADE_MS}ms ease`,
              animation: done ? `${pop} 400ms ease-out` : "none",
              // The arrow sits on the side facing the control, whichever side the bubble ends up on.
              "& .hint-arrow": {
                position: "absolute",
                width: ARROW * 2,
                height: ARROW * 2,
                "&::before": {
                  content: '""',
                  position: "absolute",
                  inset: 0,
                  bgcolor: done ? "success.main" : "primary.main",
                  transition: `background-color ${FADE_MS}ms ease`,
                  border: `${BORDER / ARROW_SCALE}px solid transparent`,
                  transform: `rotate(45deg) scale(${ARROW_SCALE})`,
                },
              },
              // Centred on the bubble's outline, the arrow covers it where they meet; only its two sides out of the bubble carry the outline on.
              "[data-popper-placement^='bottom'] & .hint-arrow": {
                top: -ARROW + BORDER / 2,
                "&::before": { borderTopColor: "currentColor", borderLeftColor: "currentColor" },
              },
              "[data-popper-placement^='top'] & .hint-arrow": {
                bottom: -ARROW + BORDER / 2,
                "&::before": { borderBottomColor: "currentColor", borderRightColor: "currentColor" },
              },
              "[data-popper-placement^='right'] & .hint-arrow": {
                left: -ARROW + BORDER / 2,
                "&::before": { borderLeftColor: "currentColor", borderBottomColor: "currentColor" },
              },
              "[data-popper-placement^='left'] & .hint-arrow": {
                right: -ARROW + BORDER / 2,
                "&::before": { borderTopColor: "currentColor", borderRightColor: "currentColor" },
              },
            }}
          >
            <Box className="hint-arrow" ref={setArrow} />
            <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, whiteSpace: "pre-line" }}>
              {t(HINTS[shown.id].textKey)}
            </Typography>
            {done ? (
              // Where the close button was: the same place now says it is over.
              <Box sx={{ display: "flex", p: "5px" }}>
                <Check fontSize="small" />
              </Box>
            ) : (
              <IconButton
                size="small"
                aria-label={t("close")}
                onClick={() => dismiss_hint(shown.id)}
                sx={{
                  color: "inherit",
                  // As on the play button, the other control drawn on this orange.
                  "&:hover": { bgcolor: "primary.dark" },
                }}
              >
                <Close fontSize="small" />
              </IconButton>
            )}
          </Box>
        </Fade>
      )}
    </Popper>
  );
};
