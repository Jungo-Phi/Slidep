import { getStorageItem, removeStorageItem, setStorageItem } from "../../utils/storage";

/**
 * A diagnostic switch for the canvas's rasterizer, to tell a GPU drawing fault (seen on Android: pieces of the mechanism drawn out of place for one frame) from one of ours.
 *
 * Set from the address and remembered across reloads: `?canvas=cpu` draws in software, `?canvas=gpu` asks for the GPU explicitly, `?canvas=auto` lets the browser choose again, which is the default.
 * Read once, at load: a context keeps the settings it was created with.
 */
export type CanvasRaster = "auto" | "cpu" | "gpu";

const STORAGE_KEY = "canvasRaster";

function read_raster(): CanvasRaster {
  const asked = new URLSearchParams(window.location.search).get("canvas");
  if (asked === "cpu" || asked === "gpu") setStorageItem(STORAGE_KEY, asked);
  else if (asked === "auto") removeStorageItem(STORAGE_KEY);
  const stored = getStorageItem<CanvasRaster>(STORAGE_KEY, "auto");
  return stored === "cpu" || stored === "gpu" ? stored : "auto";
}

export const CANVAS_RASTER: CanvasRaster =
  typeof window === "undefined" ? "auto" : read_raster();

/** What the mechanism's canvas is created with: `willReadFrequently` is the one setting that keeps a 2D canvas off the GPU. */
export const CANVAS_CONTEXT_SETTINGS: CanvasRenderingContext2DSettings =
  CANVAS_RASTER === "auto" ? {} : { willReadFrequently: CANVAS_RASTER === "cpu" };
