/**
 * Unit tests for the pure story-media math (no DOM / Firebase).
 * Run: npm --prefix tests run test:unit
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDimensions, extForBlobType, buildCreateStoryInput } from '../src/lib/storyMediaMath.ts';

test('fitDimensions downscales to fit and preserves aspect', () => {
  assert.deepEqual(fitDimensions(4000, 3000, 1080, 1920), { width: 1080, height: 810 });
  assert.deepEqual(fitDimensions(1080, 1920, 1080, 1920), { width: 1080, height: 1920 });
});

test('fitDimensions never upscales', () => {
  assert.deepEqual(fitDimensions(200, 300, 1080, 1920), { width: 200, height: 300 });
});

test('fitDimensions guards zero/negative', () => {
  assert.deepEqual(fitDimensions(0, 100, 1080, 1920), { width: 0, height: 0 });
});

test('extForBlobType maps known types and falls back by media type', () => {
  assert.equal(extForBlobType('image/jpeg', 'image'), 'jpg');
  assert.equal(extForBlobType('video/webm', 'video'), 'webm');
  assert.equal(extForBlobType('application/octet-stream', 'video'), 'mp4');
  assert.equal(extForBlobType('', 'image'), 'jpg');
});

test('buildCreateStoryInput maps a draft + urls into the createStory payload', () => {
  const draft = {
    mediaType: 'video' as const,
    width: 720,
    height: 1280,
    durationMs: 8000,
    layers: [],
    privacy: 'followers' as const,
  };
  const author = { uid: 'u1', username: 'alice', photoURL: null };
  const input = buildCreateStoryInput(
    'story123',
    { url: 'https://m', path: 'stories/u1/story123/media.webm' },
    { url: 'https://p', path: 'stories/u1/story123/poster.jpg' },
    draft,
    author,
  );
  assert.equal(input.id, 'story123');
  assert.equal(input.authorId, 'u1');
  assert.equal(input.mediaType, 'video');
  assert.equal(input.mediaUrl, 'https://m');
  assert.equal(input.posterUrl, 'https://p');
  assert.equal(input.durationMs, 8000);
  assert.equal(input.privacy, 'followers');
});

test('buildCreateStoryInput nulls the poster when absent', () => {
  const draft = {
    mediaType: 'image' as const,
    width: 1080,
    height: 1920,
    layers: [],
    privacy: 'public' as const,
  };
  const input = buildCreateStoryInput(
    'sid',
    { url: 'https://m', path: 'p/media.jpg' },
    null,
    draft,
    { uid: 'u2', username: 'bob', photoURL: 'https://pic' },
  );
  assert.equal(input.posterUrl, null);
  assert.equal(input.posterPath, null);
  assert.equal(input.durationMs, undefined);
});
