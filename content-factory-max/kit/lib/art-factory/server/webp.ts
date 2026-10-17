/**
 * Pictures to WebP at a sane size (ported from DnD-Max).
 *
 * The first real picture DnD-Max made was a 1.6 MB PNG. Every picture a
 * provider draws goes through here before it is stored:
 *
 * - no target: the review copy, no bigger than 1536px on its long side;
 * - a target: the exact size the app draws the file at, `cover` cropping to
 *   the frame or `contain` keeping the whole silhouette on transparent.
 *
 * WebP at quality 82, alpha kept: typically a tenth of the PNG. Uses `sharp`,
 * loaded only when called, so nothing in a browser bundle pays for it.
 */
export interface Converted {
  bytes: ArrayBuffer;
  contentType: "image/webp";
  width: number;
  height: number;
}

export type ImageConverter = (input: ArrayBuffer, target?: { width: number; height: number; fit: "cover" | "contain" }) => Promise<Converted>;

export const reviewLongestSide = 1536;

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export const sharpConverter: ImageConverter = async (input, target) => {
  const sharp = (await import("sharp")).default;
  const pipeline = sharp(Buffer.from(input), { failOn: "none" }).rotate();
  const sized = target
    ? pipeline.resize({ width: target.width, height: target.height, fit: target.fit, position: "centre", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : pipeline.resize({ width: reviewLongestSide, height: reviewLongestSide, fit: "inside", withoutEnlargement: true });
  const { data, info } = await sized.webp({ quality: 82, alphaQuality: 100, effort: 4 }).toBuffer({ resolveWithObject: true });
  return { bytes: toArrayBuffer(data), contentType: "image/webp", width: info.width, height: info.height };
};
