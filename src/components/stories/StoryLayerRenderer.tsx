/**
 * Renders a story's structured overlay layers over the rendered story box.
 *
 * Coordinates are NORMALIZED (0..1) to the box, so the same layer data renders
 * identically at any size. Shared by the viewer (Phase 2) and the editor (Phase 3) so
 * "what you edit" exactly matches "what viewers see".
 */
import type { Layer } from '../../lib/stories';
import { textLayerStyle } from './layerStyle';

interface Props {
  layers: Layer[];
  /** measured story-box width in px */
  width: number;
  /** measured story-box height in px */
  height: number;
}

export default function StoryLayerRenderer({ layers, width, height }: Props) {
  if (!width || !height || layers.length === 0) return null;
  const ordered = [...layers].sort((a, b) => a.z - b.z);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {ordered.map((layer) => {
        if (layer.type === 'text') {
          return (
            <div key={layer.id} style={textLayerStyle(layer, width, height)}>
              {layer.text}
            </div>
          );
        }
        return null; // future sticker types render here
      })}
    </div>
  );
}
