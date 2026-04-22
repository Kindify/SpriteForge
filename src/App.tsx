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

export default function App() {
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const [rawImageData, setRawImageData] = useState<ImageData | null>(null);
  const [processedImageData, setProcessedImageData] = useState<ImageData | null>(null);
  const [sprites, setSprites] = useState<SpriteRect[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drawMode, setDrawMode] = useState(false);

  const [bgColor, setBgColor] = useState('#ffffff');
  const [tolerance, setTolerance] = useState(30);
  const [edgeWidth, setEdgeWidth] = useState(1);
  const [erosion, setErosion] = useState(2);
  const [minPixels, setMinPixels] = useState(100);
  const [padding, setPadding] = useState(2);

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
    let out = removeBackground(rawImageData, rgb, tolerance);
    out = refineEdges(out, rgb, edgeWidth);
    setProcessedImageData(out);
    const detected = detectSprites(out, minPixels, padding, erosion);
    setSprites(assignIds(detected));
    setSelectedId(null);
  }, [rawImageData, bgColor, tolerance, edgeWidth, minPixels, padding, erosion]);

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
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-gray-800 bg-gray-900">
        <div className="px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2 mb-1">
            <Wand2 className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold tracking-tight text-white">SpriteSnip</span>
          </div>
          <p className="text-[10px] text-gray-600">Background removal & sprite slicing</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
          <section>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-2">Source</label>
            <UploadZone onImageLoaded={loadImage} />
            {rawImageData && (
              <p className="text-[10px] text-gray-600 mt-1 text-center">{rawImageData.width} x {rawImageData.height}px</p>
            )}
          </section>

          {rawImageData && (
            <>
              <section>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-2">Background</label>
                <div className="flex items-center gap-2">
                  <div className="relative w-7 h-7 rounded overflow-hidden border border-gray-700 flex-shrink-0">
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <div className="w-full h-full rounded" style={{ backgroundColor: bgColor }} />
                  </div>
                  <input value={bgColor} onChange={e => setBgColor(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] font-mono text-gray-300 outline-none focus:border-cyan-500" />
                </div>
                <p className="text-[10px] text-gray-600 mt-1">Click canvas to eyedrop color</p>
              </section>

              <section>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-2">
                  Tolerance <span className="text-cyan-400 normal-case font-normal">{tolerance}</span>
                </label>
                <input type="range" min={0} max={128} value={tolerance} onChange={e => setTolerance(+e.target.value)}
                  className="w-full accent-cyan-400" />
              </section>

              <section>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-2">
                  Edge blend <span className="text-cyan-400 normal-case font-normal">{edgeWidth}px</span>
                </label>
                <input type="range" min={0} max={6} value={edgeWidth} onChange={e => setEdgeWidth(+e.target.value)}
                  className="w-full accent-cyan-400" />
              </section>

              <section>
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest block mb-3">Detection</label>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-gray-500">Erosion</span>
                      <span className="text-[10px] text-cyan-400">{erosion}</span>
                    </div>
                    <input type="range" min={0} max={8} value={erosion} onChange={e => setErosion(+e.target.value)}
                      className="w-full accent-cyan-400" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-gray-500">Min size (px)</span>
                      <span className="text-[10px] text-cyan-400">{minPixels}</span>
                    </div>
                    <input type="range" min={10} max={2000} step={10} value={minPixels} onChange={e => setMinPixels(+e.target.value)}
                      className="w-full accent-cyan-400" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-gray-500">Padding</span>
                      <span className="text-[10px] text-cyan-400">{padding}px</span>
                    </div>
                    <input type="range" min={0} max={20} value={padding} onChange={e => setPadding(+e.target.value)}
                      className="w-full accent-cyan-400" />
                  </div>
                </div>
              </section>

              <button onClick={process}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors">
                <Wand2 className="w-4 h-4" /> Process
              </button>

              <button onClick={reset}
                className="flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
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
                Click to eyedrop background color, then hit Process
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
