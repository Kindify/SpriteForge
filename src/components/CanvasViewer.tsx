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
  eraseMode?: boolean;
  brushSize?: number;
  brushHardness?: number;
  onPixelClick: (x: number, y: number) => void;
  onSpriteClick: (id: number) => void;
  onZoomChange: (z: number) => void;
  onRectDrawn: (rect: SpriteRect) => void;
  onErase?: (x: number, y: number) => void;
  onEraseStart?: () => void;
}

export default function CanvasViewer({
  processedImageData, sprites, selectedId, zoom, drawMode,
  eraseMode = false, brushSize = 12,
  onPixelClick, onSpriteClick, onZoomChange, onRectDrawn, onErase, onEraseStart,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const erasing = useRef(false);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedImageData) return;
    canvas.width = processedImageData.width;
    canvas.height = processedImageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(processedImageData, 0, 0);

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

    if (drawRect) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.strokeRect(drawRect.x, drawRect.y, drawRect.w, drawRect.h);
      ctx.setLineDash([]);
    }

    if (eraseMode && cursorPos) {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.5 / zoom;
      ctx.beginPath();
      ctx.arc(cursorPos.x, cursorPos.y, brushSize, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 0.5 / zoom;
      ctx.beginPath();
      ctx.arc(cursorPos.x, cursorPos.y, brushSize, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [processedImageData, sprites, selectedId, zoom, drawRect, eraseMode, cursorPos, brushSize]);

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
    const pos = toImageCoords(e);
    if (!pos) return;
    if (eraseMode) {
      erasing.current = true;
      onEraseStart?.();
      onErase?.(pos.x, pos.y);
      return;
    }
    if (!drawMode) return;
    drawStart.current = pos;
  }, [drawMode, eraseMode, toImageCoords, onErase]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = toImageCoords(e);
    if (eraseMode) {
      setCursorPos(pos);
      if (erasing.current && pos) onErase?.(pos.x, pos.y);
      return;
    }
    if (!drawMode || !drawStart.current || !pos) return;
    const { x: sx, y: sy } = drawStart.current;
    setDrawRect({
      x: Math.min(sx, pos.x),
      y: Math.min(sy, pos.y),
      w: Math.abs(pos.x - sx),
      h: Math.abs(pos.y - sy),
    });
  }, [drawMode, eraseMode, toImageCoords, onErase]);

  const handleMouseUp = useCallback(() => {
    if (eraseMode) {
      erasing.current = false;
      return;
    }
    if (!drawMode || !drawStart.current) return;
    if (drawRect && drawRect.w > 4 && drawRect.h > 4) {
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
  }, [drawMode, eraseMode, drawRect, onRectDrawn]);

  const handleMouseLeave = useCallback(() => {
    setCursorPos(null);
    erasing.current = false;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (drawMode || eraseMode) return;
    const pos = toImageCoords(e);
    if (!pos) return;
    for (const s of [...sprites].reverse()) {
      if (pos.x >= s.x && pos.x <= s.x + s.width && pos.y >= s.y && pos.y <= s.y + s.height) {
        onSpriteClick(s.id);
        return;
      }
    }
    onPixelClick(Math.round(pos.x), Math.round(pos.y));
  }, [drawMode, eraseMode, toImageCoords, sprites, onSpriteClick, onPixelClick]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    onZoomChange(Math.min(8, Math.max(0.1, +(zoom + delta).toFixed(2))));
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
            cursor: eraseMode ? 'none' : drawMode ? 'crosshair' : 'default',
            display: 'block',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />
      </div>
    </div>
  );
}
