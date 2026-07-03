/**
 * Story text editor: a 9:16 canvas over the draft media where the user adds, moves,
 * resizes/rotates, styles, and deletes text layers. Tapping a layer edits its text in a
 * focused overlay. Produces the final `layers` for the review/publish step.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X, Type, Check, Trash2 } from 'lucide-react';
import type { Layer, TextLayer } from '../../../lib/stories';
import type { StoryDraft } from '../../../lib/storyMedia';
import EditableTextLayer from './EditableTextLayer';
import TextStyleBar, { STORY_FONTS } from './TextStyleBar';

interface Props {
  draft: StoryDraft;
  onBack: () => void;
  onNext: (layers: Layer[]) => void;
}

const DELETE_ZONE_PX = 130;

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `l_${Math.random().toString(36).slice(2)}`;
}

function newTextLayer(z: number): TextLayer {
  return {
    id: uid(),
    type: 'text',
    x: 0.5,
    y: 0.44,
    rotation: 0,
    scale: 1,
    z,
    text: '',
    fontFamily: STORY_FONTS[0].value,
    color: '#FFFFFF',
    backgroundColor: null,
    align: 'center',
    fontSize: 0.055,
  };
}

export default function StoryEditor({ draft, onBack, onNext }: Props) {
  const [layers, setLayers] = useState<TextLayer[]>(
    () => draft.layers.filter((l): l is TextLayer => l.type === 'text'),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [overDelete, setOverDelete] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const editingLayer = useMemo(() => layers.find((l) => l.id === editingId) ?? null, [layers, editingId]);

  const patchLayer = useCallback((id: string, patch: Partial<TextLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const addText = () => {
    const maxZ = layers.reduce((m, l) => Math.max(m, l.z), 0);
    const layer = newTextLayer(maxZ + 1);
    setLayers((prev) => [...prev, layer]);
    setSelectedId(layer.id);
    setEditingId(layer.id);
  };

  const commitEditing = () => {
    if (editingId) {
      const l = layers.find((x) => x.id === editingId);
      if (l && l.text.trim() === '') removeLayer(editingId);
    }
    setEditingId(null);
  };

  const onDragMove = (clientY: number) => {
    setDragging(true);
    setOverDelete(clientY > window.innerHeight - DELETE_ZONE_PX);
  };
  const onDragEnd = (clientY: number) => {
    if (clientY > window.innerHeight - DELETE_ZONE_PX && selectedId) removeLayer(selectedId);
    setDragging(false);
    setOverDelete(false);
  };

  const handleNext = () => {
    // Drop empty layers; strip transient selection.
    onNext(layers.filter((l) => l.text.trim() !== ''));
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-black select-none">
      {/* toolbar */}
      <div className="flex items-center justify-between p-4 z-20">
        <button type="button" onClick={onBack} aria-label="Back" className="w-9 h-9 flex items-center justify-center text-white">
          <X size={24} />
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={addText} aria-label="Add text" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 text-white text-sm font-semibold">
            <Type size={18} /> Text
          </button>
          <button type="button" onClick={handleNext} className="px-5 py-1.5 rounded-full font-semibold text-white" style={{ background: 'var(--color-brand-teal)' }}>
            Next
          </button>
        </div>
      </div>

      {/* canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-2 pb-4">
        <div
          ref={canvasRef}
          className="relative h-full rounded-2xl overflow-hidden bg-black"
          style={{ aspectRatio: '9 / 16', maxWidth: '100%' }}
          onPointerDown={() => setSelectedId(null)}
        >
          {draft.mediaType === 'video' ? (
            <video src={draft.objectUrl} className="absolute inset-0 w-full h-full object-cover" muted loop autoPlay playsInline />
          ) : (
            <img src={draft.objectUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          )}

          {box.width > 0 &&
            layers
              .filter((l) => l.id !== editingId)
              .sort((a, b) => a.z - b.z)
              .map((l) => (
                <EditableTextLayer
                  key={l.id}
                  layer={l}
                  boxW={box.width}
                  boxH={box.height}
                  selected={selectedId === l.id}
                  onSelect={() => setSelectedId(l.id)}
                  onChange={(patch) => patchLayer(l.id, patch)}
                  onRequestEdit={() => setEditingId(l.id)}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                />
              ))}
        </div>
      </div>

      {/* drag-to-delete zone */}
      {dragging && (
        <div className="absolute bottom-0 inset-x-0 flex justify-center pb-8 pointer-events-none">
          <div
            className={`flex items-center justify-center w-14 h-14 rounded-full transition-transform ${overDelete ? 'scale-125 bg-red-500' : 'bg-black/60'}`}
          >
            <Trash2 size={24} className="text-white" />
          </div>
        </div>
      )}

      {/* text entry overlay */}
      {editingLayer && (
        <TextEntryOverlay
          layer={editingLayer}
          onChange={(patch) => patchLayer(editingLayer.id, patch)}
          onDone={commitEditing}
        />
      )}
    </div>
  );
}

function TextEntryOverlay({
  layer,
  onChange,
  onDone,
}: {
  layer: TextLayer;
  onChange: (patch: Partial<TextLayer>) => void;
  onDone: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    taRef.current?.focus();
  }, []);

  const hasBg = !!layer.backgroundColor;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-black/70 backdrop-blur-sm">
      <div className="flex justify-end p-4">
        <button type="button" onClick={onDone} className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-black font-semibold text-sm">
          <Check size={16} /> Done
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6" onPointerDown={(e) => e.target === e.currentTarget && onDone()}>
        <textarea
          ref={taRef}
          value={layer.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          className="w-full max-w-md bg-transparent text-center outline-none resize-none"
          style={{
            color: layer.color,
            fontFamily: layer.fontFamily,
            textAlign: layer.align,
            fontWeight: 700,
            fontSize: 32,
            background: layer.backgroundColor ?? undefined,
            padding: hasBg ? '4px 12px' : undefined,
            borderRadius: hasBg ? 12 : undefined,
            textShadow: hasBg ? undefined : '0 1px 4px rgba(0,0,0,0.4)',
          }}
          placeholder="Type something…"
        />
      </div>

      <div className="p-4 pb-8">
        <TextStyleBar layer={layer} onChange={onChange} />
      </div>
    </div>
  );
}
