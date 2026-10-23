import { validateMoment } from './moments.js';

export const momentKey = m =>
  `${m.channel}:${m.kind}:${m.source}:${m.timelineStart || 0}:${m.time}`;
export const libraryKey = channel => `share-library-v2:${channel}`;
export const orderKey = state =>
  `share-order-v1:${JSON.stringify([state.channel, state.kind, state.source])}`;

function readItems(text) {
  const items = JSON.parse(text || '[]');
  if (!Array.isArray(items)) throw new Error('收藏格式无效');
  return items.flatMap(item => {
    try {
      return [
        validateMoment({
          ...item,
          note: typeof item.note === 'string' ? item.note.slice(0, 20) : item.note,
        }),
      ];
    } catch {
      return [];
    }
  });
}

// Existing personal edits win conflicts. Legacy entries remain untouched as a backup.
export function loadLibrary(local, session, channel) {
  const canonical = local.getItem(libraryKey(channel));
  const own = readItems(
    canonical === null ? local.getItem(`share-moments-v1:${channel}`) : canonical,
  );
  const migratedKey = `share-receiver-migrated-v2:${channel}`;
  let legacy = [];
  let warning = '';
  try {
    if (!session.getItem(migratedKey))
      legacy = readItems(session.getItem(`share-receiver-moments-v1:${channel}`));
  } catch {
    warning = '旧分享收藏无法读取，已保留原数据，其他收藏可正常使用';
  }
  const items = Array.from(new Map([...legacy, ...own].map(m => [momentKey(m), m])).values());
  let persisted = true;
  try {
    local.setItem(libraryKey(channel), JSON.stringify(items));
    if (!warning) session.setItem(migratedKey, '1');
  } catch {
    persisted = false;
  }
  return { items, persisted, warning };
}

export function normalizeOrder(value, items) {
  const keys = items.map(momentKey);
  const previous = Array.isArray(value?.keys) ? value.keys.filter(k => keys.includes(k)) : [];
  return {
    mode: ['asc', 'desc', 'custom'].includes(value?.mode) ? value.mode : 'desc',
    // New records appear first; removal cannot leave stale positions behind.
    keys: Array.from(new Set([...keys.filter(k => !previous.includes(k)), ...previous])),
  };
}

export function orderedItems(items, order) {
  const normalized = normalizeOrder(order, items);
  return items
    .slice()
    .sort((a, b) =>
      normalized.mode === 'custom'
        ? normalized.keys.indexOf(momentKey(a)) - normalized.keys.indexOf(momentKey(b))
        : normalized.mode === 'asc'
        ? a.time - b.time
        : b.time - a.time,
    );
}

export function contextualMarkers(saved, received, tab) {
  const own = saved.map(m => ({ ...m, received: false }));
  const incoming = received.map(m => ({ ...m, received: true }));
  const priority = tab === 'received' ? [...own, ...incoming] : [...incoming, ...own];
  return Array.from(new Map(priority.map(m => [momentKey(m), m])).values());
}

export function withLibraryLock(locks, channel, action) {
  if (!locks?.request)
    return Promise.reject(
      new Error('当前浏览器不支持安全保存，请使用 HTTPS 或本机地址下的新版浏览器'),
    );
  return locks.request(libraryKey(channel), action);
}

export function mutateLibrary(local, session, channel, locks, operation) {
  return withLibraryLock(locks, channel, () => {
    const loaded = loadLibrary(local, session, channel);
    if (!loaded.persisted) throw new Error('浏览器保存失败，收藏未更改');
    let items = loaded.items;
    const id = momentKey(operation.moment);
    const exists = items.some(m => momentKey(m) === id);
    let added = false;
    if (operation.type === 'add' && !exists) {
      if (items.length >= 200) throw new Error('收藏已达 200 条，请先移除不需要的记录');
      items = [validateMoment(operation.moment), ...items];
      added = true;
    } else if (operation.type === 'note') {
      if (!exists) throw new Error('这条收藏已在其他页面移除，请刷新列表');
      items = items.map(m =>
        momentKey(m) === id ? { ...m, note: operation.note.trim().slice(0, 20) } : m,
      );
    } else if (operation.type === 'remove') {
      items = items.filter(m => momentKey(m) !== id);
    }
    try {
      local.setItem(libraryKey(channel), JSON.stringify(items));
    } catch {
      throw new Error('浏览器保存失败，收藏未更改');
    }
    return { items, added };
  });
}
