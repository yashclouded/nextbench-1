/**
 * Styling controls for the text layer currently being edited: font, color, alignment,
 * and a background-pill toggle.
 */
import { AlignCenter, AlignLeft, AlignRight, Type, Square } from 'lucide-react';
import type { TextLayer } from '../../../lib/stories';

export const STORY_FONTS: { label: string; value: string }[] = [
  { label: 'Classic', value: 'Inter, system-ui, sans-serif' },
  { label: 'Elegant', value: '"Playfair Display", Georgia, serif' },
  { label: 'Mono', value: '"Courier New", monospace' },
  { label: 'Rounded', value: '"Trebuchet MS", "Segoe UI", sans-serif' },
];

export const STORY_COLORS = ['#FFFFFF', '#000000', '#FF375F', '#0071E3', '#34C759', '#FFD60A', '#FF9F0A', '#BF5AF2'];

const ALIGN_ORDER: TextLayer['align'][] = ['center', 'left', 'right'];

interface Props {
  layer: TextLayer;
  onChange: (patch: Partial<TextLayer>) => void;
}

export default function TextStyleBar({ layer, onChange }: Props) {
  const cycleAlign = () => {
    const i = ALIGN_ORDER.indexOf(layer.align);
    onChange({ align: ALIGN_ORDER[(i + 1) % ALIGN_ORDER.length] });
  };

  const cycleFont = () => {
    const i = STORY_FONTS.findIndex((f) => f.value === layer.fontFamily);
    onChange({ fontFamily: STORY_FONTS[(i + 1) % STORY_FONTS.length].value });
  };

  const toggleBg = () => {
    // Background on → pill in current color with contrasting text; off → transparent.
    if (layer.backgroundColor) {
      onChange({ backgroundColor: null });
    } else {
      const bg = layer.color;
      const text = bg.toUpperCase() === '#FFFFFF' ? '#000000' : '#FFFFFF';
      onChange({ backgroundColor: bg, color: text });
    }
  };

  const AlignIcon = layer.align === 'left' ? AlignLeft : layer.align === 'right' ? AlignRight : AlignCenter;

  return (
    <div className="flex flex-col gap-3">
      {/* controls row */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={cycleFont} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 text-white text-sm font-medium">
          <Type size={16} />
          {STORY_FONTS.find((f) => f.value === layer.fontFamily)?.label ?? 'Font'}
        </button>
        <button type="button" onClick={cycleAlign} aria-label="Alignment" className="w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white">
          <AlignIcon size={18} />
        </button>
        <button
          type="button"
          onClick={toggleBg}
          aria-label="Toggle text background"
          className={`w-9 h-9 flex items-center justify-center rounded-full ${layer.backgroundColor ? 'bg-white text-black' : 'bg-white/15 text-white'}`}
        >
          <Square size={18} />
        </button>
      </div>

      {/* color swatches */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {STORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => onChange(layer.backgroundColor ? { backgroundColor: c, color: c.toUpperCase() === '#FFFFFF' ? '#000000' : '#FFFFFF' } : { color: c })}
            className={`w-7 h-7 rounded-full shrink-0 border-2 ${
              (layer.backgroundColor ?? layer.color) === c ? 'border-white' : 'border-white/40'
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
