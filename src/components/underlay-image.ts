/**
 * Reads a dropped floor-plan image into the shape the underlay stores.
 *
 * The image is scaled down to a tracing resolution before it is kept: the
 * underlay is a guide to draw over, not an archive, and a phone photo held at
 * full size would bloat every save and export it rides along in. Component
 * layer, not domain — this is canvas and FileReader territory.
 */

export type ReadPlanImage = {
  readonly dataUrl: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
};

/** Longest edge kept after ingest. Plenty to trace against on any screen. */
const MAX_EDGE_PIXELS = 2000;

export async function readPlanImage(file: File): Promise<ReadPlanImage> {
  const original = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(
    1,
    MAX_EDGE_PIXELS / Math.max(original.naturalWidth, original.naturalHeight),
  );
  const widthPixels = Math.max(1, Math.round(original.naturalWidth * scale));
  const heightPixels = Math.max(1, Math.round(original.naturalHeight * scale));

  if (scale >= 1) {
    return { dataUrl: original.src, widthPixels, heightPixels };
  }

  const canvas = document.createElement("canvas");
  canvas.width = widthPixels;
  canvas.height = heightPixels;
  const context = canvas.getContext("2d");
  if (context === null) {
    return { dataUrl: original.src, widthPixels, heightPixels };
  }
  context.drawImage(original, 0, 0, widthPixels, heightPixels);
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.85),
    widthPixels,
    heightPixels,
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read the image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("that file is not an image"));
    image.src = dataUrl;
  });
}
