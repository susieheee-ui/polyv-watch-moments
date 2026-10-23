import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLibrary,
  libraryKey,
  momentKey,
  orderKey,
  normalizeOrder,
  orderedItems,
  contextualMarkers,
} from '../src/share-demo/moment-library.js';
import { collectionUrl, decodeCollection } from '../src/share-demo/moments.js';
const m = (time, note = '原备注') => ({
  v: 1,
  channel: '8650753',
  kind: 'playback',
  source: 'video-A',
  time,
  title: '测试',
  note,
});
const storage = () => {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
};
test('旧收藏合并到持久存储，分享入口与普通入口一致，已有备注优先', () => {
  const local = storage(),
    session = storage();
  local.setItem('share-moments-v1:8650753', JSON.stringify([m(10, '我的修改')]));
  session.setItem('share-receiver-moments-v1:8650753', JSON.stringify([m(10), m(20)]));
  const first = loadLibrary(local, session, '8650753');
  assert.equal(first.persisted, true);
  assert.equal(first.items.find(i => i.time === 10).note, '我的修改');
  assert.equal(first.items.length, 2);
  assert.deepEqual(loadLibrary(local, storage(), '8650753').items, first.items);
  assert.ok(session.getItem('share-receiver-moments-v1:8650753'));
  local.setItem(libraryKey('8650753'), '[]');
  assert.deepEqual(loadLibrary(local, session, '8650753').items, []);
});
test('坏条目不丢弃其他收藏，旧长备注截断，保存失败仍保留本次数据', () => {
  const local = storage(),
    session = storage();
  local.setItem('share-moments-v1:8650753', JSON.stringify([null, m(1, '字'.repeat(30)), m(2)]));
  const result = loadLibrary(local, session, '8650753');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].note.length, 20);
  local.setItem = () => {
    throw new Error('quota');
  };
  assert.equal(loadLibrary(local, session, '8650753').persisted, false);
});
test('自己的进度条显示修改，收到上下文保持原备注，不污染分享', () => {
  const saved = [m(10, '我的修改')],
    received = [m(10)];
  assert.equal(contextualMarkers(saved, received, 'own')[0].note, '我的修改');
  assert.equal(contextualMarkers(saved, received, 'own')[0].received, false);
  assert.equal(contextualMarkers(saved, received, 'received')[0].note, '原备注');
  assert.equal(contextualMarkers(saved, received, 'received')[0].received, true);
  assert.equal(received[0].note, '原备注');
});
test('自定义顺序序列化恢复、新增置顶、移除清理、分享保留顺序', () => {
  const items = [m(10), m(20), m(30)];
  const order = normalizeOrder(
    { mode: 'custom', keys: [momentKey(items[1]), momentKey(items[0]), momentKey(items[2])] },
    items,
  );
  const refreshed = JSON.parse(JSON.stringify(order));
  assert.deepEqual(
    orderedItems(items, refreshed).map(m => m.time),
    [20, 10, 30],
  );
  const changed = [m(40), m(10), m(30)];
  const normalized = normalizeOrder(refreshed, changed);
  assert.deepEqual(
    orderedItems(changed, normalized).map(m => m.time),
    [40, 10, 30],
  );
  assert.equal(normalized.keys.includes(momentKey(m(20))), false);
  const url = new URL(
    collectionUrl(
      { v: 1, title: '测试', items: orderedItems(items, refreshed) },
      'http://localhost',
    ),
  );
  assert.deepEqual(
    decodeCollection(new URLSearchParams(url.hash.slice(1)).get('collection')).items.map(
      m => m.time,
    ),
    [20, 10, 30],
  );
  assert.notEqual(
    orderKey({ channel: '1', kind: 'playback', source: 'a' }),
    orderKey({ channel: '1', kind: 'playback', source: 'b' }),
  );
  assert.deepEqual(
    orderedItems(items, { mode: 'asc' }).map(m => m.time),
    [10, 20, 30],
  );
  assert.deepEqual(
    orderedItems(items, { mode: 'desc' }).map(m => m.time),
    [30, 20, 10],
  );
});
