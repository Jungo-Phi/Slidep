import React from "react";

/**
 * Closes the current history entry, so what comes next undoes on its own.
 *
 * A numeric field emits one action per step, and `apply_actions` folds a run of them into a
 * single entry — which is what makes a held arrow one Ctrl+Z. Nothing in that flow says where
 * the run ends, though, and only the field knows: this is how it says so.
 *
 * `arm` keeps a run open while its steps keep coming, `close` ends an edit that stands on its
 * own. Provided by App, read by the fields wherever they sit — several components below the
 * only one holding `applyActions`. Does nothing outside a provider, which is what a panel
 * rendered in isolation wants.
 */
export interface HistorySeal {
  /** Hold the entry open for `key`'s next step; a run open for another field ends first. */
  arm: (key: string) => void;
  /** End the entry now — a typed value is a decision, never part of a run. */
  close: () => void;
}

export const HistorySealContext = React.createContext<HistorySeal>({
  arm: () => {},
  close: () => {},
});

export function useHistorySeal(): HistorySeal {
  return React.useContext(HistorySealContext);
}
