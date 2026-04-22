import { useEffect, useRef, useState } from 'react';
import { Download, CreditCard as Edit2, Check, X, Trash2 } from 'lucide-react';
import { SpriteRect, extractSpriteDataURL } from '../utils/imageProcessing';

const CHECKER_STYLE = {
  backgroundImage:
    'linear-gradient(45deg,#3a3a3a 25%,transparent 25%),' +
    'linear-gradient(-45deg,#3a3a3a 25%,transparent 25%),' +
    'linear-gradient(45deg,transparent 75%,#3a3a3a 75%),' +
    'linear-gradient(-45deg,transparent 75%,#3a3a3a 75%)',
  backgroundSize: '10px 10px',
  backgroundPosition: '0 0,0 5px,5px -5px,-5px 0',
  backgroundColor: '#2a2a2a',
};

function SpriteThumb({ sprite, imageData, isSelected, onSelect, onLabelChange, onDelete }: {
  sprite: SpriteRect;
  imageData: ImageData;
  isSelected: boolean;
  onSelect: () => void;
  onLabelChange: (label: string) => void;
  onDelete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sprite.label);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 76;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    const tmp = document.createElement('canvas');
    tmp.width = imageData.width;
    tmp.height = imageData.height;
    tmp.getContext('2d')!.putImageData(imageData, 0, 0);
    const scale = Math.min(size / sprite.width, size / sprite.height);
    const dw = sprite.width * scale;
    const dh = sprite.height * scale;
    ctx.drawImage(tmp, sprite.x, sprite.y, sprite.width, sprite.height, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }, [imageData, sprite]);

  const download = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = extractSpriteDataURL(imageData, sprite);
    a.download = `${sprite.label}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const commit = () => { onLabelChange(draft.trim() || sprite.label); setEditing(false); };

  return (
    <div
      onClick={onSelect}
      className={`relative group flex flex-col items-center gap-1.5 p-2 rounded-lg cursor-pointer transition-all border ${
        isSelected ? 'border-cyan-400 bg-cyan-950/30' : 'border-transparent bg-gray-800 hover:border-gray-600'
      }`}
    >
      <div className="w-[76px] h-[76px] rounded flex items-center justify-center" style={CHECKER_STYLE}>
        <canvas ref={canvasRef} />
      </div>

      {editing ? (
        <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
          <input
            autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            className="flex-1 text-[10px] bg-gray-700 border border-cyan-500 rounded px-1 py-0.5 text-gray-100 outline-none min-w-0"
          />
          <button onClick={commit} className="text-green-400"><Check className="w-3 h-3" /></button>
          <button onClick={() => setEditing(false)} className="text-gray-500"><X className="w-3 h-3" /></button>
        </div>
      ) : (
        <span className="text-[10px] text-gray-400 truncate w-full text-center px-1">{sprite.label}</span>
      )}

      <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
        <button onClick={e => { e.stopPropagation(); setDraft(sprite.label); setEditing(true); }}
          className="w-5 h-5 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-300" title="Rename">
          <Edit2 className="w-2.5 h-2.5" />
        </button>
        <button onClick={download}
          className="w-5 h-5 flex items-center justify-center rounded bg-gray-700 hover:bg-cyan-700 text-gray-300" title="Download">
          <Download className="w-2.5 h-2.5" />
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-5 h-5 flex items-center justify-center rounded bg-gray-700 hover:bg-red-700 text-gray-300" title="Delete">
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
      <div className="absolute bottom-1 left-1.5 text-[9px] text-gray-700 font-mono">{sprite.width}x{sprite.height}</div>
    </div>
  );
}

interface Props {
  sprites: SpriteRect[];
  processedImageData: ImageData | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onLabelChange: (id: number, label: string) => void;
  onDelete: (id: number) => void;
  onExportAll: () => void;
}

export default function SpriteRoster({ sprites, processedImageData, selectedId, onSelect, onLabelChange, onDelete, onExportAll }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">Roster</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600">{sprites.length}</span>
          {sprites.length > 0 && (
            <button onClick={onExportAll}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-cyan-700 hover:bg-cyan-600 text-white transition-colors">
              <Download className="w-2.5 h-2.5" /> All
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {!processedImageData || sprites.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-700 text-[11px] text-center p-4">
            {processedImageData ? 'No sprites detected yet' : 'Process image first'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {sprites.map(sprite => (
              <SpriteThumb
                key={sprite.id}
                sprite={sprite}
                imageData={processedImageData}
                isSelected={sprite.id === selectedId}
                onSelect={() => onSelect(sprite.id)}
                onLabelChange={label => onLabelChange(sprite.id, label)}
                onDelete={() => onDelete(sprite.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
