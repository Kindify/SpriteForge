export interface SpriteRect {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
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
  const { width, height, data } = imageData;
  const counts = new Map<number, number>();
  const samples: Array<[number, number]> = [];
  const step = Math.max(2, Math.floor(Math.min(width, height) / 40));
  for (let x = 0; x < width; x += step) {
    samples.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += step) {
    samples.push([0, y], [width - 1, y]);
  }
  for (const [x, y] of samples) {
    const i = (y * width + x) * 4;
    const r = data[i] >> 3, g = data[i + 1] >> 3, b = data[i + 2] >> 3;
    const key = (r << 10) | (g << 5) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0, bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) { bestCount = v; best = k; }
  }
  const r = ((best >> 10) & 31) << 3;
  const g = ((best >> 5) & 31) << 3;
  const b = (best & 31) << 3;
  return [r, g, b];
}

function colorDist(r: number, g: number, b: number, tr: number, tg: number, tb: number): number {
  const dr = r - tr, dg = g - tg, db = b - tb;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function removeBackground(
  imageData: ImageData,
  bgColor: [number, number, number],
  tolerance: number,
  feather: number = 12
): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data);
  const [tr, tg, tb] = bgColor;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const d = colorDist(r, g, b, tr, tg, tb);
    if (d <= tolerance) {
      out[i + 3] = 0;
    } else if (d <= tolerance + feather) {
      const t = (d - tolerance) / feather;
      out[i + 3] = Math.round(out[i + 3] * t);
    }
  }

  return new ImageData(out, width, height);
}

// Decontaminate partially-transparent edge pixels: remove bg-color bleed from RGB
// Inverts: composite = alpha*true + (1-alpha)*bg  =>  true = (composite - (1-alpha)*bg) / alpha
function decontaminateEdges(
  imageData: ImageData,
  bgColor: [number, number, number]
): ImageData {
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data);
  const [br, bg, bb] = bgColor;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0 || a === 255) continue;
    const alpha = a / 255;
    const r = (data[i] - (1 - alpha) * br) / alpha;
    const g = (data[i + 1] - (1 - alpha) * bg) / alpha;
    const b = (data[i + 2] - (1 - alpha) * bb) / alpha;
    out[i]     = Math.max(0, Math.min(255, r));
    out[i + 1] = Math.max(0, Math.min(255, g));
    out[i + 2] = Math.max(0, Math.min(255, b));
  }

  return new ImageData(out, width, height);
}

export function refineEdges(
  imageData: ImageData,
  bgColor: [number, number, number],
  edgeWidth: number
): ImageData {
  if (edgeWidth === 0) return decontaminateEdges(imageData, bgColor);

  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data);
  const [tr, tg, tb] = bgColor;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;

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
      const dist = colorDist(r, g, b, tr, tg, tb);
      const maxDist = Math.sqrt(3) * 255;
      const alpha = Math.min(255, Math.round((dist / maxDist) * 255 * 3));
      out[i + 3] = alpha;
    }
  }

  return decontaminateEdges(new ImageData(out, width, height), bgColor);
}

function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius === 0) return mask;
  // Two-pass separable erosion (min filter) for speed
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let keep = 1;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width || mask[y * width + nx] === 0) { keep = 0; break; }
      }
      tmp[y * width + x] = keep;
    }
  }
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let keep = 1;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height || tmp[ny * width + x] === 0) { keep = 0; break; }
      }
      result[y * width + x] = keep;
    }
  }
  return result;
}

export interface DetectionOptions {
  minPixels: number;
  padding: number;
  erosionRadius: number;
  minDim: number;
  maxAspect: number;
  alphaThreshold: number;
}

export function detectSprites(imageData: ImageData, opts: DetectionOptions): SpriteRect[] {
  const { width, height, data } = imageData;
  const { minPixels, padding, erosionRadius, minDim, maxAspect, alphaThreshold } = opts;

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = data[i * 4 + 3] >= alphaThreshold ? 1 : 0;
  }

  const eroded = erode(mask, width, height, erosionRadius);

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
      const cx = idx % width, cy = (idx / width) | 0;
      const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dx, dy] of neighbors) {
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

  // Compute boxes from eroded labels directly
  const boxes = new Map<number, { x1: number; y1: number; x2: number; y2: number; count: number }>();
  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i];
    if (lbl === -1) continue;
    const x = i % width, y = (i / width) | 0;
    let b = boxes.get(lbl);
    if (!b) { b = { x1: x, y1: y, x2: x, y2: y, count: 0 }; boxes.set(lbl, b); }
    if (x < b.x1) b.x1 = x;
    if (y < b.y1) b.y1 = y;
    if (x > b.x2) b.x2 = x;
    if (y > b.y2) b.y2 = y;
    b.count++;
  }

  // Expand boxes back by erosion radius so they encompass full sprite
  const results: SpriteRect[] = [];
  let idx = 1;
  for (const [, b] of boxes) {
    if (b.count < minPixels) continue;
    const grow = erosionRadius + padding;
    const x = Math.max(0, b.x1 - grow);
    const y = Math.max(0, b.y1 - grow);
    const x2 = Math.min(width - 1, b.x2 + grow);
    const y2 = Math.min(height - 1, b.y2 + grow);
    const w = x2 - x + 1;
    const h = y2 - y + 1;
    if (w < minDim || h < minDim) continue;
    const aspect = Math.max(w, h) / Math.min(w, h);
    if (aspect > maxAspect) continue;
    results.push({ id: idx, x, y, width: w, height: h, label: `sprite_${String(idx).padStart(2, '0')}` });
    idx++;
  }

  results.sort((a, b) => {
    const rowA = Math.floor(a.y / 40), rowB = Math.floor(b.y / 40);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });

  return results.map((r, i) => ({ ...r, id: i + 1, label: `sprite_${String(i + 1).padStart(2, '0')}` }));
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
  const dstCtx = dst.getContext('2d', { alpha: true })!;
  dstCtx.clearRect(0, 0, rect.width, rect.height);
  dstCtx.putImageData(cropped, 0, 0);
  return dst.toDataURL('image/png');
}

export function cropToAlphaBounds(
  imageData: ImageData,
  padding: number,
  alphaThreshold: number = 10
): ImageData {
  const { width, height, data } = imageData;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a >= alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return imageData;

  const x1 = Math.max(0, minX - padding);
  const y1 = Math.max(0, minY - padding);
  const x2 = Math.min(width - 1, maxX + padding);
  const y2 = Math.min(height - 1, maxY + padding);
  const w = x2 - x1 + 1;
  const h = y2 - y1 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const srcIdx = ((y1 + row) * width + (x1 + col)) * 4;
      const dstIdx = (row * w + col) * 4;
      out[dstIdx]     = data[srcIdx];
      out[dstIdx + 1] = data[srcIdx + 1];
      out[dstIdx + 2] = data[srcIdx + 2];
      out[dstIdx + 3] = data[srcIdx + 3];
    }
  }
  return new ImageData(out, w, h);
}

export function resizeImage(
  imageData: ImageData,
  targetW: number,
  targetH: number,
  mode: 'pixel' | 'smooth'
): ImageData {
  const src = document.createElement('canvas');
  src.width = imageData.width;
  src.height = imageData.height;
  src.getContext('2d', { alpha: true })!.putImageData(imageData, 0, 0);

  const dst = document.createElement('canvas');
  dst.width = targetW;
  dst.height = targetH;
  const ctx = dst.getContext('2d', { alpha: true })!;
  ctx.imageSmoothingEnabled = mode === 'smooth';
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(src, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

export function detectPixelArt(imageData: ImageData): boolean {
  const { width, height, data } = imageData;
  if (Math.max(width, height) > 256) return false;
  const colors = new Set<number>();
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 128) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    colors.add(key);
    if (colors.size > 64) return false;
  }
  return colors.size <= 64;
}
