import test from 'node:test';
import assert from 'node:assert/strict';
import { mutateLibrary, loadLibrary, libraryKey } from '../src/share-demo/moment-library.js';
const m = time => ({
  v: 1,
  channel: '8650753',
  kind: 'playback',
  source: 'test-video',
  time,
  title: '测试',
});
const storage = () => {
  const map = new Map();
  return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
};
function fixture(items = []) {
  const local = storage(),
    session = storage();
  local.setItem(libraryKey('8650753'), JSON.stringify(items));
  let tail = Promise.resolve();
  const locks = {
    request: (name, fn) => {
      const next = tail.then(fn);
      tail = next.catch(() => {});
      return next;
    },
  };
  const change = (type, moment, note) =>
    mutateLibrary(local, session, '8650753', locks, { type, moment, note });
  return {
    local,
    session,
    locks,
    change,
    read: () => JSON.parse(local.getItem(libraryKey('8650753'))),
  };
}
test('同时新增及过期页面备注操作保留其他页面的记录，不复活已删除记录', async () => {
  const f = fixture();
  await Promise.all([f.change('add', m(10)), f.change('add', m(20))]);
  assert.deepEqual(
    f
      .read()
      .map(x => x.time)
      .sort(),
    [10, 20],
  );
  await f.change('note', m(10), '新备注');
  await f.change('remove', m(20));
  await f.change('add', m(30));
  assert.equal(f.read().find(x => x.time === 10).note, '新备注');
  assert.equal(
    f.read().some(x => x.time === 20),
    false,
  );
  await assert.rejects(f.change('note', m(20), '过期修改'), /移除/);
});
test('旧 session 损坏不阻塞健康收藏，原损坏数据保留', async () => {
  const f = fixture([m(10), m(20)]);
  f.session.setItem('share-receiver-moments-v1:8650753', '{broken');
  const loaded = loadLibrary(f.local, f.session, '8650753');
  assert.equal(loaded.items.length, 2);
  assert.ok(loaded.warning);
  await f.change('add', m(30));
  assert.equal(f.read().length, 3);
  assert.equal(f.session.getItem('share-receiver-moments-v1:8650753'), '{broken');
});
test('主存储损坏时拒绝覆盖', async () => {
  const f = fixture();
  f.local.setItem(libraryKey('8650753'), '{broken');
  await assert.rejects(f.change('add', m(30)));
  assert.equal(f.local.getItem(libraryKey('8650753')), '{broken');
});
test('满 200 条拒绝新增，重复收藏仍允许，正常新增撤销无损', async () => {
  const f = fixture(Array.from({ length: 200 }, (_, i) => m(i)));
  await assert.rejects(f.change('add', m(200)), /200/);
  assert.equal(f.read().length, 200);
  assert.equal(f.read()[199].time, 199);
  assert.equal((await f.change('add', m(10))).added, false);
  await f.change('remove', m(0));
  await f.change('add', m(200));
  await f.change('remove', m(200));
  assert.equal(f.read().length, 199);
  assert.equal(
    f.read().some(x => x.time === 199),
    true,
  );
});
test('最终写入失败向调用方报错，删除和备注不伪装成功', async () => {
  for (const type of ['remove', 'note']) {
    const f = fixture([m(10)]);
    const write = f.local.setItem;
    let count = 0;
    f.local.setItem = (k, v) => {
      if (++count === 2) throw Error('quota');
      write(k, v);
    };
    await assert.rejects(f.change(type, m(10), '更改'), /保存失败/);
    assert.deepEqual(f.read(), [m(10)]);
  }
});
test('无锁能力时拒绝不安全写入', async () => {
  const f = fixture([m(10)]);
  await assert.rejects(
    mutateLibrary(f.local, f.session, '8650753', undefined, { type: 'add', moment: m(20) }),
    /安全保存/,
  );
  assert.deepEqual(f.read(), [m(10)]);
});
