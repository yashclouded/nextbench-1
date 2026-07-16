/**
 * Unit test for the full-screen-chat route classifier.
 * Run: npm --prefix tests run test:unit
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isFullscreenChatRoute, isChatConversationRoute } from '../src/lib/chatRoutes.ts';

test('messages inbox + nested panels are full-screen chat', () => {
  assert.equal(isFullscreenChatRoute('/messages'), true);
  assert.equal(isFullscreenChatRoute('/messages/'), true);
  assert.equal(isFullscreenChatRoute('/messages/abc123'), true);
  assert.equal(isFullscreenChatRoute('/messages/club/abc123'), true);
});

test('mobile DM and club chat routes are full-screen chat', () => {
  assert.equal(isFullscreenChatRoute('/chat/room123'), true);
  assert.equal(isFullscreenChatRoute('/club/club123'), true);
  assert.equal(isFullscreenChatRoute('/club/club123/'), true);
});

test('club settings and join are NOT full-screen chat (keep normal chrome)', () => {
  assert.equal(isFullscreenChatRoute('/club/club123/settings'), false);
  assert.equal(isFullscreenChatRoute('/club/join/INVITE1'), false);
  assert.equal(isFullscreenChatRoute('/club/join'), false);
});

test('unrelated routes are not full-screen chat', () => {
  assert.equal(isFullscreenChatRoute('/'), false);
  assert.equal(isFullscreenChatRoute('/dashboard'), false);
  assert.equal(isFullscreenChatRoute('/community'), false);
  assert.equal(isFullscreenChatRoute('/messagesfoo'), false); // no false prefix match
  assert.equal(isFullscreenChatRoute('/chatfoo'), false);
  assert.equal(isFullscreenChatRoute('/club'), false); // bare /club (discover) keeps chrome
});

test('isChatConversationRoute: an open conversation hides global chrome', () => {
  assert.equal(isChatConversationRoute('/messages/abc123'), true);
  assert.equal(isChatConversationRoute('/messages/club/abc123'), true);
  assert.equal(isChatConversationRoute('/chat/room123'), true);
  assert.equal(isChatConversationRoute('/club/club123'), true);
});

test('isChatConversationRoute: bare inbox + settings + join keep global chrome', () => {
  assert.equal(isChatConversationRoute('/messages'), false); // inbox keeps tab nav
  assert.equal(isChatConversationRoute('/messages/'), false);
  assert.equal(isChatConversationRoute('/club/club123/settings'), false);
  assert.equal(isChatConversationRoute('/club/join/INVITE1'), false);
  assert.equal(isChatConversationRoute('/club'), false);
  assert.equal(isChatConversationRoute('/'), false);
});
