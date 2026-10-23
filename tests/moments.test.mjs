import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeMoment,
  decodeMoment,
  shareUrl,
  availability,
  capture,
} from '../src/share-demo/moments.js';
const moment = {
  v: 1,
  channel: '8650753',
  kind: 'live',
  source: 'session-A',
  time: 2400,
  timelineBasis: 'server',
  timelineStart: 1800000000,
  title: '中文时刻 · 分享',
};
const state = {
  channel: '8650753',
  authorized: true,
  kind: 'live',
  source: 'session-A',
  ready: true,
  canSeek: true,
  current: 2400,
  duration: 3600,
  timelineBasis: 'server',
  timelineStart: 1800000000,
  title: '中文时刻 · 分享',
};
test('分享在无本地收藏的新窗口也可以还原中文来源与位置', () => {
  const url = new URL(shareUrl(moment, 'http://localhost:5186/?secret=must-not-leak#old'));
  assert.equal(url.search, '?channelId=8650753');
  assert.deepEqual(decodeMoment(new URLSearchParams(url.hash.slice(1)).get('moment')), moment);
});
test('未授权、新场次、直播转回放不能误播旧位置', () => {
  assert.match(availability(moment, { ...state, authorized: false }), /验证/);
  assert.match(availability(moment, { ...state, source: 'session-B' }), /更换/);
  assert.match(availability(moment, { ...state, kind: 'playback' }), /关联回放/);
  assert.equal(availability(moment, state), '');
});
test('未开始、无定位能力不能生成看似成功的收藏', () => {
  assert.throws(() => capture({ ...state, ready: false }));
  assert.throws(() => capture({ ...state, canSeek: false }));
  assert.equal(capture(state).time, 2400);
});
test('畸形链接、非法时间被拒绝', () => {
  for (const value of ['bad-link', 'x'.repeat(2300)]) assert.throws(() => decodeMoment(value));
  assert.throws(() => encodeMoment({ ...moment, time: Infinity }));
  assert.throws(() => encodeMoment({ ...moment, time: -1 }));
  assert.match(availability({ ...moment, time: 4000 }, state), /范围/);
});
test('回放分享明确指定原视频，不依赖频道默认回放', () => {
  const replay = { ...moment, kind: 'playback', source: 'original-video' };
  const url = new URL(shareUrl(replay, 'https://example.test/index.html?token=secret'));
  assert.equal(url.searchParams.get('playBackVid'), 'original-video');
  assert.equal(url.searchParams.get('token'), null);
});
test('准备中不误报场次更换，结束状态明确不可播放', () => {
  assert.match(availability(moment, { ...state, ready: false, source: '' }), /准备/);
  assert.match(availability(moment, { ...state, kind: 'end', ready: false }), /已结束/);
});
test('直播未播放不误记实时边缘，回放暂停仍可记录', () => {
  assert.throws(() => capture({ ...state, playing: false }), /先播放直播/);
  assert.equal(capture({ ...state, playing: true }).time, 2400);
  assert.equal(capture({ ...state, kind: 'playback', playing: false }).time, 2400);
});
test('同场次时间轴起点变化也阻止错误跳转，不用时间差猜测新位置', () => {
  const m = { ...moment, timelineBasis: 'server', timelineStart: 1800000000 };
  assert.equal(availability(m, { ...state, timelineStart: 1800000000 }), '');
  assert.match(availability(m, { ...state, timelineStart: 1800000265 }), /时间轴已变化/);
  assert.match(availability(m, { ...state, timelineStart: NaN }), /时间轴正在准备/);
  assert.deepEqual(decodeMoment(encodeMoment(m)), m);
});

test('备注随分享还原且限制长度', () => {
  const annotated = { ...moment, note: '这是重点' };
  assert.deepEqual(decodeMoment(encodeMoment(annotated)), annotated);
  assert.throws(() => encodeMoment({ ...moment, note: 'a'.repeat(21) }));
});

test('20 字备注可分享，21 字拒绝', () => {
  assert.equal(decodeMoment(encodeMoment({ ...moment, note: '字'.repeat(20) })).note.length, 20);
  assert.throws(() => encodeMoment({ ...moment, note: '字'.repeat(21) }));
});
