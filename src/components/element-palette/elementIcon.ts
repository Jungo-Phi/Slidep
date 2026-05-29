import beamIconUrl from "../../assets/icons/palette/beam.svg";
import pivotIconUrl from "../../assets/icons/palette/pivot.svg";
import sliderIconUrl from "../../assets/icons/palette/slider.svg";
import slidepIconUrl from "../../assets/icons/palette/slidep.svg";
import joinIconUrl from "../../assets/icons/palette/join.svg";
import springIconUrl from "../../assets/icons/palette/spring.svg";
import damperIconUrl from "../../assets/icons/palette/damper.svg";
import gearIconUrl from "../../assets/icons/palette/gear.svg";
import beltIconUrl from "../../assets/icons/palette/belt.svg";
import massIconUrl from "../../assets/icons/palette/mass.svg";
import dimensionIconUrl from "../../assets/icons/palette/dimention.svg";
import horizontalAlignIconUrl from "../../assets/icons/palette/horizontal.svg";
import verticalAlignIconUrl from "../../assets/icons/palette/vertical.svg";
import normalIconUrl from "../../assets/icons/palette/normal.svg";
import parallelIconUrl from "../../assets/icons/palette/parallel.svg";
import equalIconUrl from "../../assets/icons/palette/equal.svg";
import ratioIconUrl from "../../assets/icons/palette/ratio.svg";
import logoIconUrl from "../../assets/icons/palette/logo.svg";

import { ElementType } from "../../types";

/** All icon URLs for preloading */
const ALL_ELEMENT_ICON_URLS = [
  beamIconUrl,
  pivotIconUrl,
  sliderIconUrl,
  slidepIconUrl,
  joinIconUrl,
  springIconUrl,
  damperIconUrl,
  gearIconUrl,
  beltIconUrl,
  massIconUrl,
  dimensionIconUrl,
  horizontalAlignIconUrl,
  verticalAlignIconUrl,
  normalIconUrl,
  parallelIconUrl,
  equalIconUrl,
  ratioIconUrl,
];

/**
 * Preload all element icons to improve performance
 */
export const preload_element_icons = (): void => {
  if (typeof window === "undefined") return;

  ALL_ELEMENT_ICON_URLS.forEach((url) => {
    const img = new Image();
    img.src = url;
  });
};

export const get_element_icon = (type: ElementType | undefined): string => {
  switch (type) {
    case "pivot":
      return pivotIconUrl;
    case "slider":
      return sliderIconUrl;
    case "slidep":
      return slidepIconUrl;
    case "join":
      return joinIconUrl;
    case "mass":
      return massIconUrl;
    case "beam":
      return beamIconUrl;
    case "spring":
      return springIconUrl;
    case "damper":
      return damperIconUrl;
    case "gear":
      return gearIconUrl;
    case "belt":
      return beltIconUrl;
    case "dimension-edge":
    case "dimension-node-to-node":
    case "dimension-edge-to-node":
    case "dimension-angle":
    case "dimension-radius":
      return dimensionIconUrl;
    case "horizontal-align-edge":
    case "horizontal-align-nodes":
      return horizontalAlignIconUrl;
    case "vertical-align-edge":
    case "vertical-align-nodes":
      return verticalAlignIconUrl;
    case "normal":
      return normalIconUrl;
    case "parallel":
      return parallelIconUrl;
    case "equal":
      return equalIconUrl;
    case "gear-ratio":
      return ratioIconUrl;
  }
  return logoIconUrl;
};
