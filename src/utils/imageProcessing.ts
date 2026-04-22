export interface SpriteRect {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function sampleColor(imageData: ImageData, x: number, y: number): [number, number, number] {
  const i = (Math.round(y) * imageData.width + Math.round(x)) * 4;
  return [imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]];
}

export function autoSampleBackground(imageData: ImageData): [number, number, number] {
  // Sample the four corners and pick the most common color
  const { width, height, data } = imageData;
  const corners: [number, number][] = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const samples = corners.map(([x, y]) => sampleColor(imageData, x, y));
  // Return the first corner color as a simple heuristic
  return samples[0];
}

function colorDist(r: number, g: number, b: number, tr: number, tg: number, tb: number): number {
  return Math.sqrt((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2);
}

export function removeBackground(
  imageData: ImageData,
  bgColor: [number, number, number],
  tolerance: number
): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data);
  const [tr, tg, tb] = bgColor;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (colorDist(r, g, b, tr, tg, tb) <= tolerance) {
      out[i + 3] = 0;
    }
  }

  return new ImageData(out, width, height);
}

export function refineEdges(
  imageData: ImageData,
  bgColor: [number, number, number],
  edgeWidth: number
): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data);
  const [tr, tg, tb] = bgColor;
  const bgLum = 0.299 * tr + 0.587 * tg + 0.114 * tb;
  const isDark = bgLum < 64;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;

      // Check if this pixel is near a transparent pixel
      let nearTransparent = false;
      outer: for (let dy = -edgeWidth; dy <= edgeWidth; dy++) {
        for (let dx = -edgeWidth; dx <= edgeWidth; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) { nearTransparent = true; break outer; }
          const ni = (ny * width + nx) * 4;
          if (data[ni + 3] === 0) { nearTransparent = true; break outer; }
        }
      }

      if (!nearTransparent) continue;

      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (isDark) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const alpha = Math.min(255, lum * 2);
        out[i + 3] = alpha;
      } else {
        const dist = colorDist(r, g, b, tr, tg, tb);
        const maxDist = Math.sqrt(3 * 255 ** 2);
        const alpha = Math.min(255, Math.round((dist / maxDist) * 255 * 3));
        out[i + 3] = alpha;
      }
    }
  }

  return new ImageData(out, width, height);
}

function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius === 0) return mask;
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let keep = true;
      outer: for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || mask[ny * width + nx] === 0) {
            keep = false; break outer;
          }
        }
      }
      result[y * width + x] = keep ? 1 : 0;
    }
  }
  return result;
}

export function detectSprites(
  imageData: ImageData,
  minPixels: number,
  padding: number,
  erosionRadius: number
): SpriteRect[] {
  const { width, height, data } = imageData;

  // Build opacity mask
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = data[i * 4 + 3] > 10 ? 1 : 0;
  }

  const eroded = erode(mask, width, height, erosionRadius);

  // Connected components on eroded mask
  const labels = new Int32Array(width * height).fill(-1);
  let nextLabel = 0;
  const stack: number[] = [];

  for (let start = 0; start < eroded.length; start++) {
    if (eroded[start] === 0 || labels[start] !== -1) continue;
    const lbl = nextLabel++;
    labels[start] = lbl;
    stack.push(start);
    while (stack.length) {
      const idx = stack.pop()!;
      const cx = idx % width, cy = Math.floor(idx / width);
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (eroded[ni] === 1 && labels[ni] === -1) {
          labels[ni] = lbl;
          stack.push(ni);
        }
      }
    }
  }

  // Map eroded labels back to original mask pixels
  const spriteLabels = new Int32Array(width * height).fill(-1);
  for (let i = 0; i < width * height; i++) {
    if (mask[i] === 1) {
      // Find nearest eroded pixel with a label (within erosion radius)
      const x = i % width, y = Math.floor(i / width);
      let best = -1;
      for (let dy = -erosionRadius - 1; dy <= erosionRadius + 1 && best === -1; dy++) {
        for (let dx = -erosionRadius - 1; dx <= erosionRadius + 1 && best === -1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
            const ni = ny * width + nx;
            if (labels[ni] !== -1) best = labels[ni];
          }
        }
      }
      spriteLabels[i] = best;
    }
  }

  // Compute bounding boxes
  const boxes = new Map<number, { x1: number; y1: number; x2: number; y2: number; count: number }>();
  for (let i = 0; i < spriteLabels.length; i++) {
    const lbl = spriteLabels[i];
    if (lbl === -1) continue;
    const x = i % width, y = Math.floor(i / width);
    if (!boxes.has(lbl)) boxes.set(lbl, { x1: x, y1: y, x2: x, y2: y, count: 0 });
    const b = boxes.get(lbl)!;
    b.x1 = Math.min(b.x1, x); b.y1 = Math.min(b.y1, y);
    b.x2 = Math.max(b.x2, x); b.y2 = Math.max(b.y2, y);
    b.count++;
  }

  const results: SpriteRect[] = [];
  let idx = 1;
  for (const [, b] of boxes) {
    if (b.count < minPixels) continue;
    const x = Math.max(0, b.x1 - padding);
    const y = Math.max(0, b.y1 - padding);
    const x2 = Math.min(width - 1, b.x2 + padding);
    const y2 = Math.min(height - 1, b.y2 + padding);
    results.push({ id: idx, x, y, width: x2 - x + 1, height: y2 - y + 1, label: `sprite_${String(idx).padStart(2, '0')}` });
    idx++;
  }

  return results.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function extractSpriteDataURL(processedImageData: ImageData, rect: SpriteRect): string {
  const { width: srcW } = processedImageData;
  const src = processedImageData.data;
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);

  for (let row = 0; row < rect.height; row++) {
    for (let col = 0; col < rect.width; col++) {
      const srcIdx = ((rect.y + row) * srcW + (rect.x + col)) * 4;
      const dstIdx = (row * rect.width + col) * 4;
      out[dstIdx]     = src[srcIdx];
      out[dstIdx + 1] = src[srcIdx + 1];
      out[dstIdx + 2] = src[srcIdx + 2];
      out[dstIdx + 3] = src[srcIdx + 3];
    }
  }

  const cropped = new ImageData(out, rect.width, rect.height);
  const dst = document.createElement('canvas');
  dst.width = rect.width;
  dst.height = rect.height;
  const dstCtx = dst.getContext('2d', { alpha: true, willReadFrequently: false })!;
  dstCtx.putImageData(cropped, 0, 0);
  return dst.toDataURL('image/png');
}
