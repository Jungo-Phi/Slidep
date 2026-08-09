import { AppMode } from "../../types";
import { t, tn } from "../../i18n";

export type DdlStatus = {
  /** A verdict of two or three words: it shares its row with the DOF figure. */
  label: string;
  /**
   * The sentence behind the verdict, shown on hover — absent when the verdict says it all.
   *
   * "Rigid structure" under "DOF = 0" leaves nothing to add, and a mark offering to explain
   * it would only invite a click that teaches nothing.
   */
  hint?: string;
  color: string;
};

/**
 * How a chain's mobility reads in the active mode.
 *
 * Mobility only. The hyperstaticity is a separate statement with its own block: the two
 * answer different questions — what moves, and which constraints repeat each other — and
 * folding them into one signed number is what used to make this panel unreadable. A chain
 * can perfectly well be mobile *and* over-constrained at once.
 *
 * Edition reads like kinematics rather than saying nothing: how a mobility stands against
 * the motors driving it is a fact about the design, true whatever mode one looks at it in,
 * and a sentence that vanished on entering simulation read as something breaking. What
 * edition must not do is restate the figure — "one mobility" under "DDL = 1" was the panel's
 * worst repetition, and that phrasing is gone from every mode.
 */
export function ddl_status(
  mobility: number,
  drivers: number,
  appMode: AppMode,
): DdlStatus {
  const undriven = mobility - drivers;
  const GREEN = "success.main";
  const ORANGE = "warning.main";
  const RED = "error.main";
  const BLUE = "info.main";
  const GREY = "text.secondary";

  const rigid = { label: t("ddl_rigid"), color: GREY };
  const determined = { label: t("ddl_determined"), color: GREEN };

  switch (appMode) {
    case "static":
      // A mobility nothing drives is what makes a structure a mechanism: under load
      // it moves instead of carrying.
      if (undriven > 0)
        return {
          label: t("ddl_unstable"),
          hint: t("ddl_unstable_hint"),
          color: ORANGE,
        };
      return {
        label: t("ddl_isostatic"),
        hint: t("ddl_isostatic_hint"),
        color: GREEN,
      };

    case "edition":
    case "kinematic":
      if (mobility === 0) return rigid;
      if (drivers === 0)
        return {
          label: t("ddl_no_motor"),
          hint: t("ddl_no_motor_hint"),
          color: BLUE,
        };
      if (undriven === 0) return determined;
      if (undriven > 0)
        return {
          label: t("ddl_underdriven"),
          hint: tn("ddl_underdriven_hint", undriven),
          color: ORANGE,
        };
      return {
        label: t("ddl_overdriven"),
        hint: t("ddl_overdriven_hint"),
        color: RED,
      };

    case "dynamic":
      if (mobility === 0) return rigid;
      if (undriven <= 0) return determined;
      return {
        label: t("ddl_free_motion"),
        hint: tn("ddl_free_motion_hint", undriven),
        color: BLUE,
      };
  }
}
