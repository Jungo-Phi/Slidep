import { COLORS } from "../constants/rendering-specs";

export const generateThumbnail = (
  element: HTMLCanvasElement,
  width: number = 400,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!element) {
      reject(new Error("Élément introuvable"));
      return;
    }

    // On peut redimensionner en créant un canvas temporaire
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = width;
    const ctx = tempCanvas.getContext("2d");

    if (ctx) {
      // Dessiner le fond blanc (sinon transparent/noir selon navigateur)
      ctx.fillStyle = COLORS.BACKGROUND;
      ctx.fillRect(0, 0, width, width);
      // Dessiner le canvas original redimensionné
      ctx.drawImage(
        element,
        (element.width - element.height) / 2,
        0,
        element.height,
        element.height,
        0,
        0,
        width,
        width,
      );
      resolve(tempCanvas.toDataURL("image/jpeg", 0.5)); // JPEG pour poids réduit
    } else {
      reject(new Error("Contexte 2D inaccessible"));
    }
    return;
  });
};
