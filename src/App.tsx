import { useState, useCallback, useRef, useEffect } from 'react';
import { Wand2, ZoomIn, ZoomOut, MousePointer, PenLine, RotateCcw, Download, Clipboard, Eraser, Undo2 } from 'lucide-react';
import UploadZone from './components/UploadZone';
import CanvasViewer from './components/CanvasViewer';
import SpriteRoster from './components/SpriteRoster';
import {
  SpriteRect,
  autoSampleBackground,
  removeBackground,
  refineEdges,
  detectSprites,
  extractSpriteDataURL,
  hexToRgb,
  rgbToHex,
  cropToAlphaBounds,
  resizeImage,
  detectPixelArt,
} from './utils/imageProcessing';

let nextId = 1;

function assignIds(rects: Omit<SpriteRect, 'id'>[]): SpriteRect[] {
  return rects.map(r => ({ ...r, id: nextId++ }));
}

interface SliderProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}

function Slider({ label, hint, value, min, max, step = 1, suffix = '', onChange }: SliderProps) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-0.5">
        <span className="text-[11px] font-semibold text-gray-300">{label}</span>
        <span className="text-[11px] text-cyan-400 font-mono">{value}{suffix}</span>
      </div>
      <p className="text-[10px] text-gray-600 mb-1.5 leading-tight">{hint}</p>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)} className="w-full accent-cyan-400" />
    </div>
  );
}

function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = data.width;
  c.height = data.height;
  c.getContext('2d', { alpha: true })!.putImageData(data, 0, 0);
  return c;
}

function buildExportImage(
  src: ImageData,
  targetW: number,
  targetH: number,
  fit: 'contain' | 'stretch',
  mode: 'pixel' | 'smooth'
): ImageData {
  const cropped = cropToAlphaBounds(src, 0);
  if (fit === 'stretch') return resizeImage(cropped, targetW, targetH, mode);
  const scale = Math.min(targetW / cropped.width, targetH / cropped.height);
  const w = Math.max(1, Math.round(cropped.width * scale));
  const h = Math.max(1, Math.round(cropped.height * scale));
  const scaled = resizeImage(cropped, w, h, mode);
  const out = document.createElement('canvas');
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext('2d', { alpha: true })!;
  ctx.clearRect(0, 0, targetW, targetH);
  const tmp = imageDataToCanvas(scaled);
  ctx.drawImage(tmp, Math.floor((targetW - w) / 2), Math.floor((targetH - h) / 2));
  return ctx.getImageData(0, 0, targetW, targetH);
}

export default function App() {
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const [mode, setMode] = useState<'single' | 'sheet'>('single');
  const [rawImageData, setRawImageData] = useState<ImageData | null>(null);
  const [processedImageData, setProcessedImageData] = useState<ImageData | null>(null);
  const [sprites, setSprites] = useState<SpriteRect[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drawMode, setDrawMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [brushSize, setBrushSize] = useState(4);
  const [brushHardness, setBrushHardness] = useState(80);
  const undoStack = useRef<ImageData[]>([]);

  const [bgColor, setBgColor] = useState('#555555');
  const [tolerance, setTolerance] = useState(45);
  const [feather, setFeather] = useState(20);
  const [edgeWidth, setEdgeWidth] = useState(1);
  const [erosion, setErosion] = useState(4);
  const [minPixels, setMinPixels] = useState(400);
  const [minDim, setMinDim] = useState(35);
  const [maxAspect, setMaxAspect] = useState(3);
  const [padding, setPadding] = useState(4);

  const [targetSize, setTargetSize] = useState<number>(128);
  const [customW, setCustomW] = useState<number>(128);
  const [customH, setCustomH] = useState<number>(128);
  const [scaleMode, setScaleMode] = useState<'pixel' | 'smooth'>('smooth');
  const [sizePreset, setSizePreset] = useState<string>('128');
  const [copied, setCopied] = useState(false);

  const [exportEnabled, setExportEnabled] = useState(true);
  const [exportW, setExportW] = useState(128);
  const [exportH, setExportH] = useState(128);
  const [exportFit, setExportFit] = useState<'contain' | 'stretch'>('contain');
  const [exportLockAspect, setExportLockAspect] = useState(true);

  const loadImage = useCallback((img: HTMLImageElement) => {
    sourceRef.current = img;
    nextId = 1;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height);
    setRawImageData(data);
    setProcessedImageData(null);
    setSprites([]);
    setSelectedId(null);
    const sampled = autoSampleBackground(data);
    setBgColor(rgbToHex(sampled));
    const isPixelArt = detectPixelArt(data);
    setScaleMode(isPixelArt ? 'pixel' : 'smooth');
  }, []);

  const process = useCallback(() => {
    if (!rawImageData) return;
    const rgb = hexToRgb(bgColor);
    let out = removeBackground(rawImageData, rgb, tolerance, feather);
    out = refineEdges(out, rgb, edgeWidth);

    if (mode === 'single') {
      out = cropToAlphaBounds(out, 2);
      let tw = out.width, th = out.height;
      if (sizePreset !== 'original') {
        if (sizePreset === 'custom') {
          tw = Math.max(1, customW);
          th = Math.max(1, customH);
        } else {
          const s = targetSize;
          const scale = s / Math.max(out.width, out.height);
          tw = Math.max(1, Math.round(out.width * scale));
          th = Math.max(1, Math.round(out.height * scale));
        }
        out = resizeImage(out, tw, th, scaleMode);
      }
      setProcessedImageData(out);
      setSprites([]);
      setSelectedId(null);
      return;
    }

    setProcessedImageData(out);
    const detected = detectSprites(out, {
      minPixels,
      padding,
      erosionRadius: erosion,
      minDim,
      maxAspect,
      alphaThreshold: 40,
    });
    setSprites(assignIds(detected));
    setSelectedId(null);
  }, [rawImageData, bgColor, tolerance, feather, edgeWidth, minPixels, minDim, maxAspect, padding, erosion, mode, sizePreset, targetSize, customW, customH, scaleMode]);

  const handleErase = useCallback((cx: number, cy: number) => {
    setProcessedImageData(prev => {
      if (!prev) return prev;
      const { width, height, data } = prev;
      const out = new Uint8ClampedArray(data);
      const r = brushSize;
      const r2 = r * r;
      const x0 = Math.max(0, Math.floor(cx - r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const x1 = Math.min(width - 1, Math.ceil(cx + r));
      const y1 = Math.min(height - 1, Math.ceil(cy + r));
      const innerR = r * (brushHardness / 100);
      const innerR2 = innerR * innerR;
      const featherRange = r2 - innerR2;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, dy = y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const idx = (y * width + x) * 4 + 3;
          if (d2 <= innerR2 || featherRange <= 0) {
            out[idx] = 0;
          } else {
            const t = (d2 - innerR2) / featherRange;
            out[idx] = Math.min(out[idx], Math.round(out[idx] * t));
          }
        }
      }
      return new ImageData(out, width, height);
    });
  }, [brushSize, brushHardness]);

  const pushUndo = useCallback(() => {
    if (!processedImageData) return;
    undoStack.current.push(new ImageData(
      new Uint8ClampedArray(processedImageData.data),
      processedImageData.width,
      processedImageData.height,
    ));
    if (undoStack.current.length > 30) undoStack.current.shift();
  }, [processedImageData]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev) setProcessedImageData(prev);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '[') {
        e.preventDefault();
        setBrushSize(s => Math.max(1, s <= 4 ? s - 1 : s <= 16 ? s - 2 : Math.round(s * 0.85)));
      } else if (e.key === ']') {
        e.preventDefault();
        setBrushSize(s => Math.min(500, s < 4 ? s + 1 : s < 16 ? s + 2 : Math.round(s * 1.18)));
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (eraseMode) {
          e.preventDefault();
          undo();
        }
      } else if (e.key === 'e' || e.key === 'E') {
        if (processedImageData) {
          setEraseMode(m => !m);
          setDrawMode(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [eraseMode, processedImageData, undo]);

  const handlePixelClick = useCallback((x: number, y: number) => {
    if (!rawImageData) return;
    const i = (y * rawImageData.width + x) * 4;
    const r = rawImageData.data[i], g = rawImageData.data[i + 1], b = rawImageData.data[i + 2];
    setBgColor(rgbToHex([r, g, b]));
  }, [rawImageData]);

  const handleRectDrawn = useCallback((rect: Omit<SpriteRect, 'id'>) => {
    const id = nextId++;
    const newSprite: SpriteRect = { ...rect, id, label: `sprite_${String(id).padStart(2, '0')}` };
    setSprites(prev => [...prev, newSprite]);
    setSelectedId(newSprite.id);
    setDrawMode(false);
  }, []);

  const handleLabelChange = useCallback((id: number, label: string) => {
    setSprites(prev => prev.map(s => s.id === id ? { ...s, label } : s));
  }, []);

  const handleDelete = useCallback((id: number) => {
    setSprites(prev => prev.filter(s => s.id !== id));
    setSelectedId(prev => prev === id ? null : prev);
  }, []);

  const exportAll = useCallback(async () => {
    if (!processedImageData) return;
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      const url = extractSpriteDataURL(processedImageData, sprite);
      const blob = await (await fetch(url)).blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${sprite.label}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      await new Promise(r => setTimeout(r, 180));
    }
  }, [processedImageData, sprites]);

  const buildFinalCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!processedImageData) return null;
    const out = exportEnabled
      ? buildExportImage(processedImageData, Math.max(1, exportW), Math.max(1, exportH), exportFit, scaleMode)
      : processedImageData;
    return imageDataToCanvas(out);
  }, [processedImageData, exportEnabled, exportW, exportH, exportFit, scaleMode]);

  const downloadSingle = useCallback(async () => {
    const canvas = buildFinalCanvas();
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const blob = await (await fetch(url)).blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `sprite_${canvas.width}x${canvas.height}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  }, [buildFinalCanvas]);

  const copyBase64 = useCallback(async () => {
    const canvas = buildFinalCanvas();
    if (!canvas) return;
    await navigator.clipboard.writeText(canvas.toDataURL('image/png'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [buildFinalCanvas]);

  const reset = useCallback(() => {
    sourceRef.current = null;
    setRawImageData(null);
    setProcessedImageData(null);
    setSprites([]);
    setSelectedId(null);
    setZoom(1);
    setDrawMode(false);
    nextId = 1;
  }, []);

  const handlePresetChange = useCallback((v: string) => {
    setSizePreset(v);
    if (v !== 'original' && v !== 'custom') {
      setTargetSize(parseInt(v));
    }
  }, []);

  const displayData = processedImageData ?? rawImageData;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-200 overflow-hidden font-sans">
      <aside className="w-72 flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900">
        <div className="px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <Wand2 className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold tracking-tight text-white">Sprites Forge</span>
          </div>
          <p className="text-[10px] text-gray-600">Cut sprites from a sheet. Real RGBA PNG output.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
          <section>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-2">Mode</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setMode('single')}
                className={`py-2 rounded text-xs font-semibold transition-colors ${mode === 'single' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                Single Sprite
              </button>
              <button onClick={() => setMode('sheet')}
                className={`py-2 rounded text-xs font-semibold transition-colors ${mode === 'sheet' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                Sprite Sheet
              </button>
            </div>
          </section>

          <section>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-2">1. Source image</label>
            <UploadZone onImageLoaded={loadImage} />
            {rawImageData && (
              <p className="text-[10px] text-gray-600 mt-1 text-center">{rawImageData.width} x {rawImageData.height}px</p>
            )}
          </section>

          {rawImageData && (
            <>
              <section>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-2">2. Background color</label>
                <div className="flex items-center gap-2">
                  <div className="relative w-7 h-7 rounded overflow-hidden border border-gray-700 flex-shrink-0">
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="w-full h-full rounded" style={{ backgroundColor: bgColor }} />
                  </div>
                  <input value={bgColor} onChange={e => setBgColor(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] font-mono text-gray-300 outline-none focus:border-cyan-500" />
                </div>
                <p className="text-[10px] text-gray-600 mt-1.5 leading-tight">
                  The color that will become transparent. Click an empty area of the canvas to pick it with the eyedropper.
                </p>
              </section>

              <section className="flex flex-col gap-4">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block">3. Background removal</label>

                <Slider
                  label="Color match strictness"
                  hint="How close a pixel's color must be to the background to be erased. Higher = erases more shades, but may eat into sprites."
                  value={tolerance} min={0} max={128} onChange={setTolerance} />

                <Slider
                  label="Soft edge width"
                  hint="Gradually fades pixels near the background color (kills hard halos and glows). Higher = smoother, softer edges."
                  value={feather} min={0} max={80} onChange={setFeather} suffix="" />

                <Slider
                  label="Outline clean-up"
                  hint="Thins and anti-aliases 1-2 pixels right around each sprite. Usually 1 is fine. Set to 0 if edges look chewed."
                  value={edgeWidth} min={0} max={4} onChange={setEdgeWidth} suffix="px" />
              </section>

              {mode === 'sheet' && (
                <section className="flex flex-col gap-4">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block">4. Sprite detection</label>

                  <Slider
                    label="Separation strength"
                    hint="How aggressively to pull sprites apart that touch or share glow. Turn UP if sprites merge into one box. Turn DOWN if small sprites vanish."
                    value={erosion} min={0} max={12} onChange={setErosion} />

                  <Slider
                    label="Minimum sprite size (pixels)"
                    hint="Ignores blobs smaller than this many pixels total. Raise to reject small specks, dots, and punctuation."
                    value={minPixels} min={10} max={3000} step={10} onChange={setMinPixels} />

                  <Slider
                    label="Minimum width/height"
                    hint="Ignores boxes narrower or shorter than this. Raise to skip letters and thin labels (e.g. set to 35 to reject text)."
                    value={minDim} min={1} max={200} onChange={setMinDim} suffix="px" />

                  <Slider
                    label="Max shape stretchiness"
                    hint="Rejects boxes that are much longer than they are tall (like words of text). Lower = stricter (squarer shapes only)."
                    value={maxAspect} min={1} max={10} step={0.5} onChange={setMaxAspect} suffix="x" />

                  <Slider
                    label="Crop padding"
                    hint="Extra space added around each detected sprite when exporting. Prevents clipping glows or soft edges."
                    value={padding} min={0} max={30} onChange={setPadding} suffix="px" />
                </section>
              )}

              {processedImageData && (
                <section className="flex flex-col gap-3">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block">Manual cleanup</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => { setEraseMode(e => !e); setDrawMode(false); }}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded text-xs font-semibold transition-colors ${eraseMode ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                      <Eraser className="w-3.5 h-3.5" /> {eraseMode ? 'Erasing' : 'Erase'}
                    </button>
                    <button onClick={undo} disabled={undoStack.current.length === 0}
                      className="flex items-center justify-center gap-1.5 py-2 rounded text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <Undo2 className="w-3.5 h-3.5" /> Undo
                    </button>
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-[11px] font-semibold text-gray-300">Brush size</span>
                      <div className="flex items-center gap-1">
                        <input type="number" min={1} max={500} value={brushSize}
                          onChange={e => setBrushSize(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                          className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] font-mono text-cyan-400 outline-none focus:border-cyan-500 text-right" />
                        <span className="text-[10px] text-gray-600">px</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-600 mb-1.5 leading-tight">
                      Diameter in image pixels. Drag the slider for coarse changes, type a number for exact, or use [ / ] keys.
                    </p>
                    <input type="range" min={1} max={120} step={1} value={Math.min(120, brushSize)}
                      onChange={e => setBrushSize(+e.target.value)} className="w-full accent-cyan-400" />
                    <div className="flex gap-1 mt-1.5">
                      {[1, 2, 4, 8, 16, 32].map(s => (
                        <button key={s} onClick={() => setBrushSize(s)}
                          className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors ${brushSize === s ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Slider
                    label="Brush hardness"
                    hint="100 = sharp circular eraser. Lower values feather the brush edge for soft cleanups."
                    value={brushHardness} min={0} max={100} step={5} onChange={setBrushHardness} suffix="%" />
                </section>
              )}

              {mode === 'single' && (
                <section className="flex flex-col gap-3">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block">4. Output size</label>

                  <div>
                    <span className="text-[11px] font-semibold text-gray-300 block mb-1">Preset</span>
                    <select value={sizePreset} onChange={e => handlePresetChange(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[11px] text-gray-300 outline-none focus:border-cyan-500">
                      <option value="original">Original (auto-cropped)</option>
                      <option value="16">16 px (longest side)</option>
                      <option value="32">32 px</option>
                      <option value="64">64 px</option>
                      <option value="128">128 px</option>
                      <option value="256">256 px</option>
                      <option value="custom">Custom...</option>
                    </select>
                  </div>

                  {sizePreset === 'custom' && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <span className="text-[10px] text-gray-500 block mb-1">Width</span>
                        <input type="number" min={1} max={4096} value={customW}
                          onChange={e => setCustomW(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] font-mono text-gray-300 outline-none focus:border-cyan-500" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] text-gray-500 block mb-1">Height</span>
                        <input type="number" min={1} max={4096} value={customH}
                          onChange={e => setCustomH(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] font-mono text-gray-300 outline-none focus:border-cyan-500" />
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-[11px] font-semibold text-gray-300 block mb-1">Scaling style</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button onClick={() => setScaleMode('pixel')}
                        className={`py-1.5 rounded text-[11px] font-medium transition-colors ${scaleMode === 'pixel' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                        Pixel (crisp)
                      </button>
                      <button onClick={() => setScaleMode('smooth')}
                        className={`py-1.5 rounded text-[11px] font-medium transition-colors ${scaleMode === 'smooth' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                        Smooth
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1.5 leading-tight">
                      Pixel keeps hard edges (good for pixel art). Smooth uses bilinear filtering (good for illustrations).
                    </p>
                  </div>
                </section>
              )}

              <button onClick={process}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors">
                <Wand2 className="w-4 h-4" /> {mode === 'single' ? 'Process sprite' : 'Process & detect'}
              </button>

              {mode === 'single' && processedImageData && (
                <>
                  <section className="flex flex-col gap-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Export size</label>
                      <button onClick={() => setExportEnabled(v => !v)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${exportEnabled ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                        {exportEnabled ? 'On' : 'Off'}
                      </button>
                    </div>

                    <div className={exportEnabled ? '' : 'opacity-40 pointer-events-none'}>
                      <div className="grid grid-cols-5 gap-1 mb-2">
                        {[16, 32, 64, 128, 256].map(s => (
                          <button key={s} onClick={() => { setExportW(s); setExportH(s); }}
                            className={`py-1 rounded text-[10px] font-mono transition-colors ${exportW === s && exportH === s ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                            {s}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <div className="flex-1">
                          <span className="text-[10px] text-gray-500 block mb-0.5">Width</span>
                          <input type="number" min={1} max={4096} value={exportW}
                            onChange={e => {
                              const v = Math.max(1, Math.min(4096, parseInt(e.target.value) || 1));
                              setExportW(v);
                              if (exportLockAspect) setExportH(v);
                            }}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] font-mono text-gray-200 outline-none focus:border-cyan-500" />
                        </div>
                        <button onClick={() => setExportLockAspect(v => !v)}
                          title={exportLockAspect ? 'Locked square (W=H)' : 'Free aspect ratio'}
                          className={`mt-4 px-2 py-1 rounded text-[10px] font-semibold transition-colors ${exportLockAspect ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}>
                          {exportLockAspect ? '=' : '\u2260'}
                        </button>
                        <div className="flex-1">
                          <span className="text-[10px] text-gray-500 block mb-0.5">Height</span>
                          <input type="number" min={1} max={4096} value={exportH}
                            onChange={e => {
                              const v = Math.max(1, Math.min(4096, parseInt(e.target.value) || 1));
                              setExportH(v);
                              if (exportLockAspect) setExportW(v);
                            }}
                            className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-[11px] font-mono text-gray-200 outline-none focus:border-cyan-500" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 mt-2">
                        <button onClick={() => setExportFit('contain')}
                          className={`py-1.5 rounded text-[10px] font-medium transition-colors ${exportFit === 'contain' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                          Fit (centered)
                        </button>
                        <button onClick={() => setExportFit('stretch')}
                          className={`py-1.5 rounded text-[10px] font-medium transition-colors ${exportFit === 'stretch' ? 'bg-cyan-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                          Stretch
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1.5 leading-tight">
                        Fit re-crops to the sprite, scales to fit inside W x H, and centers it on a transparent square. Stretch fills the canvas exactly. Uses the {scaleMode} scaling style above.
                      </p>
                    </div>
                  </section>

                  <div className="flex gap-2">
                    <button onClick={downloadSingle}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors">
                      <Download className="w-3.5 h-3.5" /> Download PNG
                    </button>
                    <button onClick={copyBase64}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-colors">
                      <Clipboard className="w-3.5 h-3.5" /> {copied ? 'Copied!' : 'Copy as base64'}
                    </button>
                  </div>
                </>
              )}

              <button onClick={reset}
                className="flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Start over
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {displayData && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900 flex-shrink-0">
            {mode === 'sheet' && (
              <>
                <button onClick={() => { setDrawMode(false); setEraseMode(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${!drawMode && !eraseMode ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  <MousePointer className="w-3.5 h-3.5" /> Select
                </button>
                <button onClick={() => { setDrawMode(true); setEraseMode(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${drawMode ? 'bg-amber-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  <PenLine className="w-3.5 h-3.5" /> Draw
                </button>
                <div className="w-px h-4 bg-gray-700 mx-1" />
              </>
            )}
            {processedImageData && (
              <>
                <button onClick={() => { setEraseMode(e => !e); setDrawMode(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${eraseMode ? 'bg-rose-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  <Eraser className="w-3.5 h-3.5" /> Erase
                </button>
                <button onClick={undo} disabled={undoStack.current.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
                <div className="w-px h-4 bg-gray-700 mx-1" />
              </>
            )}
            <button onClick={() => setZoom(z => Math.min(8, +(z + 0.25).toFixed(2)))}
              className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-gray-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.max(0.1, +(z - 0.25).toFixed(2)))}
              className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1" />
            {mode === 'sheet' && drawMode && (
              <span className="text-[10px] text-amber-400 bg-amber-950/40 px-2 py-1 rounded">
                Drag to draw a sprite boundary
              </span>
            )}
            {mode === 'sheet' && !drawMode && !processedImageData && rawImageData && (
              <span className="text-[10px] text-gray-600">
                Click an empty area to sample the background, then Process.
              </span>
            )}
            {mode === 'sheet' && processedImageData && (
              <span className="text-[10px] text-gray-500">
                {sprites.length} sprite{sprites.length === 1 ? '' : 's'} detected
              </span>
            )}
            {mode === 'single' && processedImageData && (
              <span className="text-[10px] text-gray-500">
                {processedImageData.width} x {processedImageData.height}px
              </span>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0">
          {!rawImageData ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
                <Wand2 className="w-8 h-8 text-gray-700" />
              </div>
              <div>
                <p className="text-gray-400 font-medium mb-1">No image loaded</p>
                <p className="text-gray-700 text-sm">Upload {mode === 'single' ? 'a sprite' : 'a sprite sheet'} using the panel on the left</p>
              </div>
            </div>
          ) : (
            <CanvasViewer
              processedImageData={displayData}
              sprites={sprites}
              selectedId={selectedId}
              zoom={zoom}
              drawMode={mode === 'sheet' && drawMode}
              eraseMode={eraseMode && !!processedImageData}
              brushSize={brushSize}
              brushHardness={brushHardness}
              onPixelClick={handlePixelClick}
              onSpriteClick={setSelectedId}
              onZoomChange={setZoom}
              onRectDrawn={handleRectDrawn}
              onErase={handleErase}
              onEraseStart={pushUndo}
            />
          )}
        </div>
      </div>

      {mode === 'sheet' && (
        <aside className="w-52 flex-shrink-0 border-l border-gray-800 bg-gray-900">
          <SpriteRoster
            sprites={sprites}
            processedImageData={processedImageData}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onLabelChange={handleLabelChange}
            onDelete={handleDelete}
            onExportAll={exportAll}
          />
        </aside>
      )}
    </div>
  );
}
