export const DEFAULT_CHANNEL = '8650753';
export function formatTime(value) {
  const s = Math.max(0, Math.floor(Number(value) || 0));
  const h = Math.floor(s / 3600);
  return (
    (h ? `${h}:` : '') +
    [Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':')
  );
}
// Match the origin actually supplied to the SDK player, never estimate from a client clock.
export function liveTimeline(sessionId, shift, raw) {
  const start = raw?.pushStreamStartTime;
  if (
    !sessionId ||
    !shift?.timeShiftEnabled ||
    shift.sessionId !== sessionId ||
    !Number.isFinite(start) ||
    start <= 0 ||
    shift.serverPushStreamStartTime !== start
  )
    return { timelineStart: 0, timelineBasis: '' };
  return { timelineStart: start / 1000, timelineBasis: 'server' };
}
function validateTimelineBasis(value) {
  if (value.timelineBasis !== undefined && value.timelineBasis !== 'server')
    throw new Error('直播时间轴来源无效');
}
export function validateMoment(value) {
  if (value) validateTimelineBasis(value);
  if (
    !value ||
    value.v !== 1 ||
    !/^\d{1,12}$/.test(value.channel) ||
    !['live', 'playback'].includes(value.kind)
  )
    throw new Error('分享内容格式不正确');
  if (!Number.isFinite(value.time) || value.time < 0 || value.time > 604800)
    throw new Error('分享时间无效');
  if (typeof value.source !== 'string' || !value.source || value.source.length > 200)
    throw new Error('缺少内容来源');
  if (typeof value.title !== 'string' || value.title.length > 200) throw new Error('分享标题无效');
  if (
    value.timelineStart !== undefined &&
    (!Number.isFinite(value.timelineStart) || value.timelineStart <= 0)
  )
    throw new Error('直播时间轴信息无效');
  if (value.note !== undefined && (typeof value.note !== 'string' || value.note.length > 20))
    throw new Error('备注最多 20 字');
  return {
    ...(value.kind === 'live' && value.timelineBasis === 'server'
      ? { timelineBasis: 'server' }
      : {}),
    ...(value.note ? { note: value.note } : {}),
    ...(value.kind === 'live' && value.timelineStart !== undefined
      ? { timelineStart: value.timelineStart }
      : {}),
    v: 1,
    channel: value.channel,
    kind: value.kind,
    time: Math.floor(value.time),
    source: value.source,
    title: value.title,
  };
}
export function encodeMoment(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateMoment(value)));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export function decodeMoment(text) {
  if (!text || text.length > 2200) throw new Error('分享链接无效');
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)),
    );
    return validateMoment(JSON.parse(json));
  } catch {
    throw new Error('分享链接无效或已损坏');
  }
}
export function shareUrl(moment, base) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('channelId', moment.channel);
  if (moment.kind === 'playback') url.searchParams.set('playBackVid', moment.source);
  url.hash = `moment=${encodeMoment(moment)}`;
  return url.href;
}
function sourceMismatch(kind) {
  return kind === 'live'
    ? '直播场次已更换，请在当前直播重新打点并分享；原记录已保留'
    : '当前内容已更换，不能定位到这条收藏';
}
export function availability(moment, state) {
  if (moment.channel !== state.channel) return '这个时刻属于另一个频道';
  if (!state.authorized) return '请先通过原频道的观看验证';
  if (!['live', 'playback'].includes(state.kind))
    return '当前直播未开始或已结束，暂时没有可定位的内容';
  if (moment.kind !== state.kind)
    return moment.kind === 'live'
      ? '这条直播收藏尚未关联回放，原时刻已为你保留'
      : '当前没有开放对应回放';
  if (!state.ready || !state.source) return '内容正在准备，请稍候';
  if (moment.source !== state.source) return sourceMismatch(moment.kind);
  if (moment.kind === 'live') {
    if (moment.timelineBasis !== 'server' || moment.timelineStart === undefined)
      return '旧版直播记录使用估算时间轴，请在当前直播重新打点；原记录已保留';
    if (state.timelineBasis !== 'server' || !(state.timelineStart > 0))
      return '直播时间轴正在准备，请稍候';
    if (moment.timelineStart !== state.timelineStart)
      return '直播时间轴已变化，暂时无法可靠定位到原时刻';
  }
  if (!state.canSeek) return '当前内容暂不支持定位';
  if (moment.time > state.duration) return '这个时刻超出当前可观看范围';
  return '';
}
export function capture(state) {
  if (state.kind === 'live' && (state.timelineBasis !== 'server' || !(state.timelineStart > 0)))
    throw new Error('直播时间轴正在准备，请稍候再记录');
  if (state.kind === 'live' && state.playing === false)
    throw new Error('请先播放直播，再记下正在观看的时刻');
  if (
    !state.authorized ||
    !state.ready ||
    !state.canSeek ||
    !state.source ||
    !Number.isFinite(state.current) ||
    state.current < 0
  )
    throw new Error('暂时不能收藏，等待可定位的内容开始播放');
  return validateMoment({
    v: 1,
    channel: state.channel,
    kind: state.kind,
    source: state.source,
    time: state.current,
    ...(state.kind === 'live' ? { timelineBasis: 'server' } : {}),
    ...(state.kind === 'live' && Number.isFinite(state.timelineStart)
      ? { timelineStart: state.timelineStart }
      : {}),
    title: state.title,
  });
}

export function validateCollection(value) {
  if (
    !value ||
    value.v !== 1 ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 60 ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 20
  )
    throw new Error('合集需包含 1–20 个时刻，名称不超过 60 字');
  const items = value.items.map(validateMoment);
  const first = items[0];
  if (
    items.some(
      m =>
        m.channel !== first.channel ||
        m.kind !== first.kind ||
        m.source !== first.source ||
        (m.timelineStart !== undefined &&
          first.timelineStart !== undefined &&
          Math.abs(m.timelineStart - first.timelineStart) > 30),
    )
  )
    throw new Error('本版合集仅支持同一场直播或同一回放');
  return { v: 1, title: value.title.trim(), items };
}
export function collectionUrl(value, base) {
  const collection = validateCollection(value);
  const bytes = new TextEncoder().encode(JSON.stringify(collection));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  if (encoded.length > 12000) throw new Error('合集链接过长，请减少时刻数量');
  const url = new URL(base);
  url.search = '';
  url.searchParams.set('channelId', collection.items[0].channel);
  if (collection.items[0].kind === 'playback')
    url.searchParams.set('playBackVid', collection.items[0].source);
  url.hash = `collection=${encoded}`;
  return url.href;
}
export function decodeCollection(text) {
  if (!text || text.length > 12000) throw new Error('合集链接无效');
  try {
    return validateCollection(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c =>
            c.charCodeAt(0),
          ),
        ),
      ),
    );
  } catch {
    throw new Error('合集链接无效或已损坏');
  }
}
