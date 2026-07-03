# Stories — Phase 3: Creation, Editor & Upload

**Status:** Approved · **Date:** 2026-07-03 · Builds on Phase 1 (data/API) + Phase 2 (viewer).

The creation (write) experience: pick/capture media → crop/zoom → add & style text layers →
preview → publish. Replaces the Phase 2 `+` toast stub with a real flow. Consumes the
Phase 1 API (`newStoryId`, `uploadStoryMedia`, `createStory`) and the Phase 2 renderer.

## Locked decisions
| Area | Decision |
|------|----------|
| Capture | Platform-adaptive: **desktop → `<input type=file>`** (library + `capture`); **mobile (coarse pointer / Capacitor native) → custom in-app camera** (`getUserMedia` preview, tap-to-capture photo, tap/hold-to-record via `MediaRecorder`, front/back flip). Falls back to file-input `capture` if `getUserMedia` is unavailable. |
| Text transforms | **Both**: selection bounding box + corner handle (drag = resize + rotate; mouse & touch) **and** two-finger pinch/rotate (hand-rolled two-pointer tracking, no gesture lib). |
| Media processing | Images → canvas downscale ≤1080×1920 + JPEG re-encode. Video → **no transcode**; capture a poster frame + enforce duration/size limits; upload as-is. |

## Draft model
```ts
interface StoryDraft {
  blob: Blob;               // processed media (compressed image, or raw recorded/picked video)
  objectUrl: string;        // preview URL (revoked on unmount)
  mediaType: 'image' | 'video';
  width: number; height: number;
  durationMs?: number;
  posterBlob?: Blob | null; // video only
  layers: Layer[];
  privacy: StoryPrivacy;    // 'public' | 'followers'
}
```

## Stage A — media pipeline & end-to-end wiring
- `src/lib/storyMedia.ts` — pure `fitDimensions(w,h,maxW,maxH)`; `compressImage`,
  `getVideoMeta`, `capturePoster(videoUrl)`, `isMobileCapture()`, HEIC via existing
  `heic-converter`; `publishStory(draft, author, onProgress)` →
  `newStoryId` → `uploadStoryMedia(media)` → (video) `uploadStoryMedia(poster)` →
  `createStory(...)`. Limits: `MAX_VIDEO_MS` (60s), `MAX_VIDEO_BYTES` (100MB), image target
  1080×1920.
- `StoryComposer.tsx` — full-screen flow (`pick → crop → edit → post`), owns the draft;
  revokes object URLs; portal + scroll lock.
- `StorySourcePicker.tsx` — Library / Photo / Video; desktop file inputs, mobile → camera.
- `StoryCamera.tsx` — basic mobile camera (capture, record, flip), returns a blob + meta.
- Reuse **`ImageCropper`** at `aspect={9/16}` for images; video skips crop (cover-fit).
- Wire `Stories.tsx`: the `+` opens `StoryComposer`; pass `refetch` for post-publish refresh.
- **Milestone:** create a plain (no-text) image/video story end-to-end and see it in the row.

## Stage B — text editor
- Extract `src/components/stories/layerStyle.ts` — the single positioning formula
  (`left=x·W, top=y·H, translate(-50%,-50%) rotate scale`, `fontSize=fontSize·W`).
  Refactor Phase 2 `StoryLayerRenderer` to use it so editor ↔ viewer stay pixel-identical.
- `StoryEditor.tsx` — 9:16 canvas (media + layers), toolbar (add text, privacy, next), a
  drag-to-**delete** zone that appears while dragging a layer, selected-layer state.
- `EditableTextLayer.tsx` — move (Motion drag), corner-handle resize+rotate, two-finger
  pinch/rotate, tap-to-edit text, selection chrome. Resize maps to the layer's `scale`;
  `fontSize` stays a normalized base constant.
- `TextStyleBar.tsx` — font allowlist (Inter, Playfair Display, + 2 system), color swatches,
  alignment cycle, background-pill toggle.

## Stage C — preview, privacy & publish
- Final review step renders the composed story through the shared renderer; privacy
  selector (**public / followers**; closeFriends deferred — no membership yet); upload
  progress + error states; `publishStory` → close → `refetch` the tray (exposed from
  `useStoriesTray`).

## Testing & verification
Unit-test pure helpers (`fitDimensions`, `layerStyle`, draft→`CreateStoryInput` mapping) via
`tests/` + `node --test`; `tsc --noEmit` + `vite build`; manual QA: `+` → create → row →
viewer. Camera/canvas paths are DOM-bound → verified manually.

## Out of scope (Phase 3)
Stickers/polls/questions/GIF/location/hashtags/mentions, highlights, close-friends
membership, reactions/replies, filters/drawing, multi-segment stories. The layer schema
already reserves the sticker types.

## Notes / risks
- Custom camera needs camera permission; on Capacitor Android that requires manifest
  permissions — flagged for the app shell (not code here). getUserMedia requires HTTPS.
- Recorded video MIME varies (`video/webm` vs `mp4`); `publishStory` derives the extension
  from `blob.type`. Poster capture works for both picked and recorded video.
