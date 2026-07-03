/**
 * The single source of truth for how a text layer is positioned and styled from its
 * NORMALIZED (0..1) data over a box of (w,h). Shared by the viewer's StoryLayerRenderer
 * and the editor's EditableTextLayer so "what you edit" === "what viewers see".
 */
import type { CSSProperties } from 'react';
import type { TextLayer } from '../../lib/stories';

export function textLayerFontSizePx(layer: TextLayer, w: number): number {
  return Math.max(layer.fontSize * w, 8);
}

/** Full absolute-positioned style for a text layer (used for render AND editing). */
export function textLayerStyle(layer: TextLayer, w: number, h: number): CSSProperties {
  const fontSize = textLayerFontSizePx(layer, w);
  const hasBg = !!layer.backgroundColor;
  return {
    position: 'absolute',
    left: layer.x * w,
    top: layer.y * h,
    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
    transformOrigin: 'center',
    maxWidth: w * 0.92,
    color: layer.color,
    fontFamily: layer.fontFamily,
    fontSize,
    fontWeight: 700,
    lineHeight: 1.2,
    textAlign: layer.align,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: layer.backgroundColor ?? undefined,
    padding: hasBg ? `${fontSize * 0.18}px ${fontSize * 0.4}px` : undefined,
    borderRadius: hasBg ? fontSize * 0.35 : undefined,
    textShadow: hasBg ? undefined : '0 1px 4px rgba(0,0,0,0.4)',
  };
}
