import { useState, useCallback, useRef } from 'react';
import { Wand2, ZoomIn, ZoomOut, MousePointer, PenLine, RotateCcw } from 'lucide-react';
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

export default function App() {
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const [rawImageData, setRawImageData] = useState<ImageData | null>(null);
  const [processedImageData, setProcessedImageData] = useState<ImageData | null>(null);
  const [sprites, setSprites] = useState<SpriteRect[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drawMode, setDrawMode] = useState(false);

  const [bgColor, setBgColor] = useState('#555555');
  const [tolerance, setTolerance] = useState(45);
  const [feather, setFeather] = useState(20);
  const [edgeWidth, setEdgeWidth] = useState(1);
  const [erosion, setErosion] = useState(4);
  const [minPixels, setMinPixels] = useState(400);
  const [minDim, setMinDim] = useState(35);
  const [maxAspect, setMaxAspect] = useState(3);
  const [padding, setPadding] = useState(4);

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
  }, []);

  const process = useCallback(() => {
    if (!rawImageData) return;
    const rgb = hexToRgb(bgColor);
    let out = removeBackground(rawImageData, rgb, tolerance, feather);
    out = refineEdges(out, rgb, edgeWidth);
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
  }, [rawImageData, bgColor, tolerance, feather, edgeWidth, minPixels, minDim, maxAspect, padding, erosion]);

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

  const exportAll = useCallback(() => {
    if (!processedImageData) return;
    for (const sprite of sprites) {
      const a = document.createElement('a');
      a.href = extractSpriteDataURL(processedImageData, sprite);
      a.download = `${sprite.label}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [processedImageData, sprites]);

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

  const displayData = processedImageData ?? rawImageData;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-200 overflow-hidden font-sans">
      <aside className="w-72 flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900">
        <div className="px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <Wand2 className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold tracking-tight text-white">SpriteSnip</span>
          </div>
          <p className="text-[10px] text-gray-600">Cut sprites from a sheet. Real RGBA PNG output.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
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

              <button onClick={process}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors">
                <Wand2 className="w-4 h-4" /> Process &amp; detect
              </button>

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
            <button onClick={() => setDrawMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${!drawMode ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              <MousePointer className="w-3.5 h-3.5" /> Select
            </button>
            <button onClick={() => setDrawMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${drawMode ? 'bg-amber-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
              <PenLine className="w-3.5 h-3.5" /> Draw
            </button>
            <div className="w-px h-4 bg-gray-700 mx-1" />
            <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
              className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-gray-600 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.max(0.1, +(z - 0.25).toFixed(2)))}
              className="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1" />
            {drawMode && (
              <span className="text-[10px] text-amber-400 bg-amber-950/40 px-2 py-1 rounded">
                Drag to draw a sprite boundary
              </span>
            )}
            {!drawMode && !processedImageData && rawImageData && (
              <span className="text-[10px] text-gray-600">
                Click an empty area to sample the background, then Process.
              </span>
            )}
            {processedImageData && (
              <span className="text-[10px] text-gray-500">
                {sprites.length} sprite{sprites.length === 1 ? '' : 's'} detected
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
                <p className="text-gray-700 text-sm">Upload a sprite sheet using the panel on the left</p>
              </div>
            </div>
          ) : (
            <CanvasViewer
              processedImageData={displayData}
              sprites={sprites}
              selectedId={selectedId}
              zoom={zoom}
              drawMode={drawMode}
              onPixelClick={handlePixelClick}
              onSpriteClick={setSelectedId}
              onZoomChange={setZoom}
              onRectDrawn={handleRectDrawn}
            />
          )}
        </div>
      </div>

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
    </div>
  );
}
