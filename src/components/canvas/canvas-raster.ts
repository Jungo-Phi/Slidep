import { getStorageItem, removeStorageItem, setStorageItem } from "../../utils/storage";

/**
 * Which rasterizer draws the mechanism's canvas.
 *
 * Android's GPU rasterizer draws pieces of the mechanism out of place for a frame now and then (a pulley's holes, a stray arc), which the software one never does: Android draws in software unless told otherwise.
 * The address can force either, remembered across reloads, to compare the two: `?canvas=cpu`, `?canvas=gpu`, and `?canvas=auto` to go back to the default.
 * Read once, at load: a context keeps the settings it was created with.
 */
export type CanvasRaster = "auto" | "cpu" | "gpu";

const STORAGE_KEY = "canvasRaster";

function read_raster(): CanvasRaster {
  const asked = new URLSearchParams(window.location.search).get("canvas");
  if (asked === "cpu" || asked === "gpu") setStorageItem(STORAGE_KEY, asked);
  else if (asked === "auto") removeStorageItem(STORAGE_KEY);
  const stored = getStorageItem<CanvasRaster>(STORAGE_KEY, "auto");
  if (stored === "cpu" || stored === "gpu") return stored;
  return /Android/i.test(navigator.userAgent) ? "cpu" : "auto";
}

const RASTER: CanvasRaster = typeof window === "undefined" ? "auto" : read_raster();

/** What the mechanism's canvas is created with: `willReadFrequently` is the one setting that keeps a 2D canvas off the GPU. */
export const CANVAS_CONTEXT_SETTINGS: CanvasRenderingContext2DSettings =
  RASTER === "auto" ? {} : { willReadFrequently: RASTER === "cpu" };
