import { useRef, useState, useCallback } from 'react';
import { Upload } from 'lucide-react';

interface Props {
  onImageLoaded: (img: HTMLImageElement) => void;
}

export default function UploadZone({ onImageLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { onImageLoaded(img); URL.revokeObjectURL(url); };
    img.src = url;
  }, [onImageLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, [loadFile]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  }, [loadFile]);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
        dragging ? 'border-cyan-400 bg-cyan-950/30' : 'border-gray-700 hover:border-gray-500 bg-gray-800/40'
      }`}
    >
      <Upload className="w-5 h-5 text-gray-500" />
      <span className="text-[11px] text-gray-500 text-center leading-tight">
        Drop sprite sheet<br />or click to browse
      </span>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  );
}
