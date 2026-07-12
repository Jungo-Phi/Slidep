import { icon } from "./iconDataUris";
import { UnionElement } from "../../types";

export const get_element_icon = (element: UnionElement | undefined): string => {
  if (!element) return icon("logo");
  switch (element.type) {
    case "pivot":
      if (element.motor) return icon("motor");
      return icon("pivot");
    case "slider":
      return icon("slider");
    case "slidep":
      return icon("slidep");
    case "join":
      return icon("join");
    case "mass":
      return icon("mass");
    case "gear":
      return icon("gear");
    case "beam":
      return icon("beam");
    case "spring":
      return icon("spring");
    case "damper":
      return icon("damper");
    case "belt":
      return icon("belt");
    case "dimension-edge":
    case "dimension-node-to-node":
    case "dimension-edge-to-node":
    case "dimension-angle":
    case "dimension-radius":
    case "dimension-belt":
      return icon("dimention");
    case "horizontal-align-edge":
    case "horizontal-align-nodes":
      return icon("horizontal");
    case "vertical-align-edge":
    case "vertical-align-nodes":
      return icon("vertical");
    case "normal":
      return icon("normal");
    case "parallel":
      return icon("parallel");
    case "equal":
      return icon("equal");
    case "gear-ratio":
      return icon("ratio");
    case "force":
      return icon("force");
    case "moment":
      return icon("moment");
    case "distributed-force":
      return icon("distributed-force");
  }
};
