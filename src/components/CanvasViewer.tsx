import { useRef, useEffect, useState, useCallback } from 'react';
import { SpriteRect } from '../utils/imageProcessing';

const CHECKER = {
  backgroundImage:
    'linear-gradient(45deg,#1a1a1a 25%,transparent 25%),' +
    'linear-gradient(-45deg,#1a1a1a 25%,transparent 25%),' +
    'linear-gradient(45deg,transparent 75%,#1a1a1a 75%),' +
    'linear-gradient(-45deg,transparent 75%,#1a1a1a 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
  backgroundColor: '#111',
};

interface Props {
  processedImageData: ImageData | null;
  sprites: SpriteRect[];
  selectedId: number | null;
  zoom: number;
  drawMode: boolean;
  onPixelClick: (x: number, y: number) => void;
  onSpriteClick: (id: number) => void;
  onZoomChange: (z: number) => void;
  onRectDrawn: (rect: SpriteRect) => void;
}

export default function CanvasViewer({
  processedImageData, sprites, selectedId, zoom, drawMode,
  onPixelClick, onSpriteClick, onZoomChange, onRectDrawn,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Render image + overlays
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedImageData) return;
    canvas.width = processedImageData.width;
    canvas.height = processedImageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(processedImageData, 0, 0);

    // Draw sprite overlays
    for (const s of sprites) {
      const isSelected = s.id === selectedId;
      ctx.strokeStyle = isSelected ? '#22d3ee' : 'rgba(34,211,238,0.5)';
      ctx.lineWidth = isSelected ? 2 / zoom : 1 / zoom;
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.width - 1, s.height - 1);
      if (isSelected) {
        ctx.fillStyle = 'rgba(34,211,238,0.08)';
        ctx.fillRect(s.x, s.y, s.width, s.height);
      }
    }

    // Live draw rect
    if (drawRect) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.strokeRect(drawRect.x, drawRect.y, drawRect.w, drawRect.h);
      ctx.setLineDash([]);
    }
  }, [processedImageData, sprites, selectedId, zoom, drawRect]);

  const toImageCoords = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !processedImageData) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    if (x < 0 || y < 0 || x >= processedImageData.width || y >= processedImageData.height) return null;
    return { x, y };
  }, [processedImageData, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!drawMode) return;
    const pos = toImageCoords(e);
    if (!pos) return;
    drawStart.current = pos;
  }, [drawMode, toImageCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawMode || !drawStart.current) return;
    const pos = toImageCoords(e);
    if (!pos) return;
    const { x: sx, y: sy } = drawStart.current;
    setDrawRect({
      x: Math.min(sx, pos.x),
      y: Math.min(sy, pos.y),
      w: Math.abs(pos.x - sx),
      h: Math.abs(pos.y - sy),
    });
  }, [drawMode, toImageCoords]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawMode || !drawStart.current) return;
    const pos = toImageCoords(e);
    if (pos && drawRect && drawRect.w > 4 && drawRect.h > 4) {
      onRectDrawn({
        id: 0,
        x: Math.round(drawRect.x),
        y: Math.round(drawRect.y),
        width: Math.round(drawRect.w),
        height: Math.round(drawRect.h),
        label: '',
      });
    }
    drawStart.current = null;
    setDrawRect(null);
  }, [drawMode, toImageCoords, drawRect, onRectDrawn]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (drawMode) return;
    const pos = toImageCoords(e);
    if (!pos) return;

    // Check sprite hit
    for (const s of [...sprites].reverse()) {
      if (pos.x >= s.x && pos.x <= s.x + s.width && pos.y >= s.y && pos.y <= s.y + s.height) {
        onSpriteClick(s.id);
        return;
      }
    }
    onPixelClick(Math.round(pos.x), Math.round(pos.y));
  }, [drawMode, toImageCoords, sprites, onSpriteClick, onPixelClick]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    onZoomChange(Math.min(4, Math.max(0.1, +(zoom + delta).toFixed(2))));
  }, [zoom, onZoomChange]);

  if (!processedImageData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-700 text-sm">
        Process an image to see it here
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto" onWheel={handleWheel} style={CHECKER}>
      <div style={{ width: processedImageData.width * zoom, height: processedImageData.height * zoom, margin: 'auto' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: processedImageData.width * zoom,
            height: processedImageData.height * zoom,
            imageRendering: zoom >= 2 ? 'pixelated' : 'auto',
            cursor: drawMode ? 'crosshair' : 'default',
            display: 'block',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
        />
      </div>
    </div>
  );
}
