/**
 * Unit test for the shared text-layer positioning math (editor ↔ viewer WYSIWYG).
 * Run: npm --prefix tests run test:unit
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { textLayerStyle, textLayerFontSizePx } from '../src/components/stories/layerStyle.ts';

const base = {
  id: 'a',
  type: 'text' as const,
  x: 0.5,
  y: 0.25,
  rotation: 30,
  scale: 2,
  z: 1,
  text: 'hi',
  fontFamily: 'Inter',
  color: '#fff',
  backgroundColor: null,
  align: 'center' as const,
  fontSize: 0.05,
};

test('position and font size scale with the box width/height', () => {
  const s = textLayerStyle(base, 1000, 2000);
  assert.equal(s.left, 500);
  assert.equal(s.top, 500);
  assert.equal(s.fontSize, 50); // 0.05 * 1000
  assert.equal(s.transform, 'translate(-50%, -50%) rotate(30deg) scale(2)');
  assert.equal(s.textAlign, 'center');
});

test('font size has a floor of 8px', () => {
  assert.equal(textLayerFontSizePx({ ...base, fontSize: 0.001 }, 100), 8);
});

test('background pill sets padding/radius and no text-shadow', () => {
  const s = textLayerStyle({ ...base, backgroundColor: '#000' }, 1000, 2000);
  assert.equal(s.background, '#000');
  assert.ok(s.padding);
  assert.equal(s.textShadow, undefined);
});
