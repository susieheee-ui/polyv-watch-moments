import test from 'node:test';
import assert from 'node:assert/strict';
import { playSharedMedia } from '../src/share-demo/autoplay.js';
test('有声播放成功时不改变静音状态', async () => {
  const m = { muted: false, play: async () => {} };
  assert.equal(await playSharedMedia(m), 'playing');
  assert.equal(m.muted, false);
});
test('有声播放被拦截后自动静音重试', async () => {
  let calls = 0;
  const m = {
    muted: false,
    play: async () => {
      calls++;
      if (!m.muted) throw Object.assign(new Error(), { name: 'NotAllowedError' });
    },
  };
  assert.equal(await playSharedMedia(m), 'muted');
  assert.equal(calls, 2);
  assert.equal(m.muted, true);
});
test('换源中断不误判为自动播放限制', async () => {
  const m = {
    muted: false,
    play: async () => {
      throw Object.assign(new Error(), { name: 'AbortError' });
    },
  };
  assert.equal(await playSharedMedia(m), 'waiting');
  assert.equal(m.muted, false);
});
test('两次播放失败保留手动入口且恢复静音状态', async () => {
  const m = {
    muted: false,
    play: async () => {
      throw Object.assign(new Error(), { name: 'NotAllowedError' });
    },
  };
  assert.equal(await playSharedMedia(m), 'blocked');
  assert.equal(m.muted, false);
});
test('旧跳转取消后不会静音或重试', async () => {
  let active = true,
    calls = 0;
  const m = {
    muted: false,
    play: async () => {
      calls++;
      active = false;
      throw Object.assign(new Error(), { name: 'NotAllowedError' });
    },
  };
  assert.equal(await playSharedMedia(m, () => active), 'cancelled');
  assert.equal(calls, 1);
  assert.equal(m.muted, false);
});
