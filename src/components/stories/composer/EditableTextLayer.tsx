/**
 * An interactive text layer in the editor. Supports:
 *  - one-finger / mouse drag to move (normalized x/y),
 *  - two-finger pinch to scale + rotate,
 *  - a corner handle to resize + rotate with a mouse or single finger,
 *  - tap (no movement) to edit the text,
 *  - drag reporting so the parent can offer a drag-to-delete zone.
 *
 * Uses the shared `textLayerStyle` so it renders identically to the viewer.
 */
import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TextLayer } from '../../../lib/stories';
import { textLayerStyle } from '../layerStyle';

interface Props {
  layer: TextLayer;
  boxW: number;
  boxH: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<TextLayer>) => void;
  onRequestEdit: () => void;
  onDragMove: (clientY: number) => void;
  onDragEnd: (clientY: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);

export default function EditableTextLayer({
  layer,
  boxW,
  boxH,
  selected,
  onSelect,
  onChange,
  onRequestEdit,
  onDragMove,
  onDragEnd,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const start = useRef<{ mode: 'move' | 'pinch'; layer: TextLayer; px?: number; py?: number; dist?: number; angle?: number } | null>(null);
  const moved = useRef(false);
  const handleStart = useRef<{ cx: number; cy: number; dist: number; angle: number; scale: number; rotation: number } | null>(null);

  // ── body: move + pinch ──
  const onBodyDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    onSelect();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      start.current = { mode: 'move', layer: { ...layer }, px: e.clientX, py: e.clientY };
      moved.current = false;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      start.current = { mode: 'pinch', layer: { ...layer }, dist: dist(a, b) || 1, angle: angle(a, b) };
    }
  };

  const onBodyMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = start.current;
    if (!st) return;

    if (pointers.current.size >= 2 && st.mode === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      const d = dist(a, b);
      const an = angle(a, b);
      onChange({
        scale: clamp(st.layer.scale * (d / (st.dist || 1)), 0.3, 8),
        rotation: st.layer.rotation + ((an - (st.angle ?? 0)) * 180) / Math.PI,
      });
    } else if (st.mode === 'move') {
      const dx = e.clientX - (st.px ?? 0);
      const dy = e.clientY - (st.py ?? 0);
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
      onChange({ x: clamp(st.layer.x + dx / boxW, 0, 1), y: clamp(st.layer.y + dy / boxH, 0, 1) });
      if (moved.current) onDragMove(e.clientY);
    }
  };

  const onBodyUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      if (start.current?.mode === 'move' && !moved.current) {
        onRequestEdit();
      } else if (moved.current) {
        onDragEnd(e.clientY);
      }
      start.current = null;
      moved.current = false;
    } else if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      start.current = { mode: 'move', layer: { ...layer }, px: only.x, py: only.y };
    }
  };

  // ── corner handle: resize + rotate ──
  const onHandleDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const vx = e.clientX - cx;
    const vy = e.clientY - cy;
    handleStart.current = {
      cx,
      cy,
      dist: Math.hypot(vx, vy) || 1,
      angle: Math.atan2(vy, vx),
      scale: layer.scale,
      rotation: layer.rotation,
    };
  };

  const onHandleMove = (e: ReactPointerEvent) => {
    const hs = handleStart.current;
    if (!hs) return;
    const vx = e.clientX - hs.cx;
    const vy = e.clientY - hs.cy;
    const d = Math.hypot(vx, vy);
    const an = Math.atan2(vy, vx);
    onChange({
      scale: clamp(hs.scale * (d / hs.dist), 0.3, 8),
      rotation: hs.rotation + ((an - hs.angle) * 180) / Math.PI,
    });
  };

  const onHandleUp = () => {
    handleStart.current = null;
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onBodyDown}
      onPointerMove={onBodyMove}
      onPointerUp={onBodyUp}
      onPointerCancel={onBodyUp}
      style={{
        ...textLayerStyle(layer, boxW, boxH),
        pointerEvents: 'auto',
        cursor: 'move',
        touchAction: 'none',
        outline: selected ? '1.5px dashed rgba(255,255,255,0.9)' : undefined,
        outlineOffset: 8,
      }}
    >
      {layer.text || ' '}
      {selected && (
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          style={{
            position: 'absolute',
            bottom: -11,
            right: -11,
            width: 22,
            height: 22,
            borderRadius: 11,
            background: '#fff',
            border: '2px solid var(--color-brand-teal)',
            touchAction: 'none',
            cursor: 'nwse-resize',
          }}
        />
      )}
    </div>
  );
}
