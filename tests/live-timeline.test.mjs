import test from 'node:test';
import assert from 'node:assert/strict';
import * as moments from '../src/share-demo/moments.js';
const shift = {
  sessionId: 'live-A',
  serverPushStreamStartTime: 1800000000000,
  timeShiftEnabled: true,
};
const raw = { pushStreamStartTime: 1800000000000 };
test('直播起点取服务端值，不受页面打开时间和本地时钟影响', () => {
  assert.equal(typeof moments.liveTimeline, 'function');
  assert.deepEqual(moments.liveTimeline('live-A', shift, raw), {
    timelineStart: 1800000000,
    timelineBasis: 'server',
  });
  assert.equal(moments.liveTimeline('live-B', shift, raw).timelineStart, 0);
  assert.equal(moments.liveTimeline('live-A', shift, {}).timelineStart, 0);
  assert.equal(
    moments.liveTimeline('live-A', shift, { pushStreamStartTime: 1800000010000 }).timelineStart,
    0,
  );
});
test('新直播分享携带服务端时间轴，跨页面还原可跳转，旧估算记录不可冒充', () => {
  const state = {
    channel: '8650753',
    kind: 'live',
    source: 'live-A',
    title: '直播',
    current: 129,
    duration: 300,
    playing: true,
    authorized: true,
    ready: true,
    canSeek: true,
    timelineStart: 1800000000,
    timelineBasis: 'server',
  };
  const m = moments.capture(state);
  assert.equal(m.timelineBasis, 'server');
  const received = moments.decodeMoment(moments.encodeMoment(m));
  assert.equal(moments.availability(received, { ...state, current: 20, duration: 500 }), '');
  assert.match(moments.availability({ ...received, timelineBasis: undefined }, state), /旧版/);
  assert.match(moments.availability(received, { ...state, timelineStart: 1800000001 }), /时间轴/);
  assert.throws(() => moments.capture({ ...state, timelineStart: 0, timelineBasis: '' }), /时间轴/);
});
