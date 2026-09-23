// The idle hug's source art has lilac ears on the visiting dog, unlike the
// pink base palette used by every skin. Normalize only those pixels before
// applying the selected skin; rotating the whole frame also changes its fur.
export function normalizeHugSenderPalette(pixels: Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (!pixels[i + 3] || b <= r || b <= g || b < 50 || b - Math.min(r, g) < 8) continue;
    const min = Math.min(r, g), light = (b + min) / 510;
    const saturation = (b - min) / (255 * (1 - Math.abs(2 * light - 1)));
    const l = Math.min(1, light + .015);
    const chroma = (1 - Math.abs(2 * l - 1)) * Math.min(.95, saturation * 3.7);
    const m = l - chroma / 2;
    // Hue 355° matches the receiver's pink ear/cheek palette.
    const target = [chroma + m, m, chroma / 12 + m];
    const blend = Math.min(1, (b - r) / 12, (b - g) / 12);
    for (let channel = 0; channel < 3; channel++) {
      pixels[i + channel] = Math.round(pixels[i + channel] * (1 - blend) + target[channel] * 255 * blend);
    }
  }
}
