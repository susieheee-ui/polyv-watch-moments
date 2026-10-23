import { playSharedMedia } from './autoplay';
import { reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  momentKey,
  libraryKey,
  loadLibrary,
  orderKey,
  normalizeOrder,
  orderedItems,
  mutateLibrary,
  withLibraryLock,
} from './moment-library';
import { useWatchAppStore } from '@/store/use-watch-app-store';
import { useChannelStore } from '@/store/use-channel-store';
import { useChannelInfoStore } from '@/store/use-channel-info-store';
import { usePlaybackStore } from '@/store/use-playback-store';
import {
  formatTime,
  liveTimeline,
  availability,
  capture,
  shareUrl,
  collectionUrl,
  decodeMoment,
  decodeCollection,
  validateMoment,
} from './moments';

export interface Moment {
  v: number;
  channel: string;
  kind: string;
  source: string;
  time: number;
  title: string;
  note?: string;
  timelineStart?: number;
  timelineBasis?: string;
}
const data = reactive({
  saved: [] as Moment[],
  order: { mode: 'desc', keys: [] as string[] },
  draft: [] as Moment[],
  title: '我的精彩时刻',
  shared: null as Moment | null,
  collection: null as { title: string; items: Moment[] } | null,
  undo: null as Moment | null,
  toastMoment: null as Moment | null,
  toast: '',
  receivedToast: false,
  playbackNotice: '',
  fallback: '',
  lit: false,
  lastMarkedKey: '',
  activeKey: '',
  highlightKey: '',
  error: '',
  panelOpen: false,
  panelTab: 'own' as 'own' | 'received',
  state: {
    channel: '',
    kind: '',
    source: '',
    title: '',
    current: 0,
    duration: 0,
    authorized: false,
    ready: false,
    canSeek: false,
    status: '',
    playing: false,
    timelineStart: 0,
    timelineBasis: '',
  },
});
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const key = momentKey;

export function useShare() {
  const app = useWatchAppStore();
  const channel = useChannelStore();
  const info = useChannelInfoStore();
  const playback = usePlaybackStore();
  const core = () => app.getWatchCore();
  const sharedReason = computed(() => (data.shared ? availability(data.shared, data.state) : ''));
  const ownMoments = computed(() =>
    data.saved.filter(
      m =>
        m.channel === data.state.channel &&
        m.kind === data.state.kind &&
        m.source === data.state.source,
    ),
  );

  function notify(message: string, keepUndo = false) {
    if (!keepUndo) {
      data.undo = null;
      data.toastMoment = null;
    }
    data.receivedToast = false;
    data.toast = message;
    resumeToast();
  }
  function pauseToast() {
    clearTimeout(toastTimer);
  }
  function resumeToast() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => {
        data.toast = '';
        data.receivedToast = false;
        data.toastMoment = null;
        data.lit = false;
        data.undo = null;
      },
      data.toastMoment || data.receivedToast ? 6000 : 3500,
    );
  }
  let pendingShared = false;
  let pendingReceivedNotice = false;
  let observedStatus = '';
  let refreshingLive = false;
  let cancelSeek: (() => void) | undefined;
  function sample() {
    try {
      const c = core();
      const status = c.channel.getLiveStatus();
      // A stream start must rebuild the official SDK time-shift timeline.
      if (observedStatus && observedStatus !== 'live' && status === 'live') {
        data.state.ready = false;
        data.state.canSeek = false;
        if (!refreshingLive) {
          refreshingLive = true;
          location.reload();
        }
        return;
      }
      observedStatus = status;
      const kind = app.isPlaybackWatchUrl ? 'playback' : status;
      const source =
        kind === 'live'
          ? c.channel.getCurrentSessionId()
          : playback.currentPlaybackTarget?.playbackId;
      const current = c.player.getCurrentTime();
      const duration = c.player.getDurationTime();
      const ready = !!c.player.getPlayerInfo().playerInited;
      const media = document.querySelector<HTMLVideoElement>(
        '.c-pc-watch-layout__main__player-inner video',
      );
      Object.assign(data.state, {
        channel: channel.channelId,
        status,
        kind,
        source: String(source || ''),
        title: info.channelTitle,
        current,
        duration,
        ...(kind === 'live'
          ? liveTimeline(
              String(source || ''),
              c.player.getTimeShiftService().getTimeShiftData(),
              c.channel.getChannelDetail().timeShift,
            )
          : { timelineStart: 0, timelineBasis: '' }),
        ready,
        authorized: app.watchPageInited,
        playing: !!media && !media.paused && media.readyState >= 2,
        canSeek:
          ready &&
          Number.isFinite(current) &&
          Number.isFinite(duration) &&
          duration > 0 &&
          (kind === 'live'
            ? c.player.supportLiveTimeShift().support
            : kind === 'playback' && c.playback.getFastForwardBackwardEnabled()),
      });
      if (pendingReceivedNotice && ready && app.watchPageInited) {
        pendingReceivedNotice = false;
        notify(`收到 ${data.collection?.items.length || 1} 个精彩时刻`);
        data.receivedToast = true;
        resumeToast();
      }
      if (pendingShared && data.shared && !availability(data.shared, data.state)) {
        pendingShared = false;
        playAt(data.shared.time);
      }
    } catch {
      data.state.ready = false;
      data.state.canSeek = false;
    }
  }
  async function changeLibrary(type: string, moment: Moment, note = '') {
    try {
      const result = await mutateLibrary(
        localStorage,
        sessionStorage,
        channel.channelId,
        navigator.locks,
        { type, moment, note },
      );
      data.saved = result.items;
      return result;
    } catch (error) {
      notify(error instanceof Error ? error.message : '浏览器保存失败，收藏未更改');
      return null;
    }
  }
  async function syncLibrary() {
    try {
      const loaded = await withLibraryLock(navigator.locks, channel.channelId, () =>
        loadLibrary(localStorage, sessionStorage, channel.channelId),
      );
      data.saved = loaded.items;
      if (loaded.warning) notify(loaded.warning);
      else if (!loaded.persisted) notify('浏览器保存失败，收藏未更改');
    } catch {
      notify('无法读取浏览器收藏，原数据未更改');
    }
  }
  function onStorage(event: StorageEvent) {
    if (event.key === libraryKey(channel.channelId)) syncLibrary();
  }
  function setOrder(mode: string, keys = data.order.keys) {
    data.order = normalizeOrder({ mode, keys }, ownMoments.value);
    try {
      localStorage.setItem(orderKey(data.state), JSON.stringify(data.order));
    } catch {
      notify('排序仅本次保留，浏览器保存失败');
    }
  }
  const orderedMoments = computed(() => orderedItems(ownMoments.value, data.order));
  watch(
    () => [orderKey(data.state), ownMoments.value.map(key).join('|')],
    () => {
      if (!data.state.source) return;
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem(orderKey(data.state)) || 'null');
      } catch {
        /* Use a safe default if storage is unavailable or malformed. */
      }
      setOrder(stored?.mode || 'desc', stored?.keys || []);
    },
  );
  async function copy(url: string) {
    data.fallback = '';
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      data.fallback = url;
      return false;
    }
  }
  async function save(moment?: Moment) {
    sample();
    try {
      const m: Moment = moment || capture(data.state);
      data.undo = null;
      const result = await changeLibrary('add', m);
      if (!result) return;
      if (result.added) data.undo = m;
      data.activeKey = key(m);
      data.lastMarkedKey = key(m);
      data.lit = true;
      data.fallback = '';
      data.toastMoment = m;
      notify(`已记录 ${formatTime(m.time)}`, true);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function share(moment: Moment) {
    data.undo = null;
    notify((await copy(shareUrl(moment, location.href))) ? '这一刻的链接已复制' : '请手动复制链接');
  }
  function playAt(time: number) {
    cancelSeek?.();
    data.playbackNotice = '';
    const container = document.querySelector('.c-pc-watch-layout__main__player-inner');
    let active = true;
    const pending = new WeakSet<HTMLVideoElement>();
    const play = async (media: HTMLVideoElement) => {
      if (!active || pending.has(media) || media.readyState < 2) return;
      pending.add(media);
      const result = await playSharedMedia(media, () => active && media.isConnected);
      pending.delete(media);
      if (!active || result === 'cancelled') return;
      if (result === 'playing' || result === 'muted') {
        if (result === 'muted') data.playbackNotice = 'muted';
        // Native play already succeeded. SDK play can reload the live stream,
        // emitting canplay again and trapping this listener in a reload loop.
        cancelSeek?.();
      } else if (result === 'blocked') data.playbackNotice = 'blocked';
    };
    const onReady = (event: Event) => {
      if (event.target instanceof HTMLVideoElement) play(event.target);
    };
    container?.addEventListener('canplay', onReady, true);
    const timeout = setTimeout(() => {
      const media = container?.querySelector('video');
      if (active && (!media || media.paused)) data.playbackNotice = 'blocked';
      cancelSeek?.();
    }, 15000);
    cancelSeek = () => {
      active = false;
      clearTimeout(timeout);
      container?.removeEventListener('canplay', onReady, true);
      cancelSeek = undefined;
    };
    core().player.seekVideo(time);
    const media = container?.querySelector('video');
    // Live seek replaces the stream asynchronously: the current ready video
    // still belongs to the old stream. Wait for the destination's canplay.
    if (media && data.state.kind !== 'live') play(media);
  }
  async function enableSharedPlayback() {
    const media = document.querySelector<HTMLVideoElement>(
      '.c-pc-watch-layout__main__player-inner video',
    );
    if (!media) return;
    try {
      media.muted = false;
      core().player.setVolume(core().player.getCurrentVolume() || 0.7);
      await media.play();
      cancelSeek?.();
      data.playbackNotice = '';
    } catch {
      data.playbackNotice = 'blocked';
    }
  }
  function seek(moment: Moment) {
    pendingShared = false;
    sample();
    const reason = availability(moment, data.state);
    if (reason) {
      notify(reason);
      return;
    }
    playAt(moment.time);
    data.activeKey = key(moment);
    data.highlightKey = key(moment);
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      data.highlightKey = '';
    }, 2200);
  }
  function backLive() {
    sample();
    if (data.state.status !== 'live' || !data.state.ready || !data.state.authorized) return;
    pendingShared = false;
    if (data.state.kind !== 'live') {
      location.assign(`${location.pathname}?channelId=${encodeURIComponent(channel.channelId)}`);
      return;
    }
    if (core().player.supportLiveTimeShift().support) playAt(-1);
    else core().player.play();
    notify('正在返回直播…');
  }
  async function updateNote(moment: Moment, note: string) {
    if (!(await changeLibrary('note', moment, note))) return;
    if (data.toastMoment && key(data.toastMoment) === key(moment))
      data.toastMoment = data.saved.find(m => key(m) === key(moment)) || null;
  }
  async function remove(moment: Moment) {
    if (!(await changeLibrary('remove', moment))) return false;
    if (data.toastMoment && key(data.toastMoment) === key(moment)) data.toastMoment = null;
    data.draft = data.draft.filter(item => key(item) !== key(moment));
    if (data.activeKey === key(moment)) data.activeKey = '';
    return true;
  }
  async function undoSave() {
    const moment = data.undo;
    if (moment && (await remove(moment))) notify('已撤销收藏');
  }
  function add(moment: Moment) {
    if (data.draft.some(item => key(item) === key(moment))) return;
    if (data.draft.length >= 20) {
      notify('一个合集最多 20 个时刻');
      return;
    }
    if (
      data.draft.length &&
      (moment.source !== data.draft[0].source || moment.kind !== data.draft[0].kind)
    ) {
      notify('请选择同一场内容的时刻');
      return;
    }
    data.draft.push(moment);
  }
  function move(index: number, offset: number) {
    const next = index + offset;
    if (next < 0 || next >= data.draft.length) return;
    const items = data.draft.slice();
    [items[index], items[next]] = [items[next], items[index]];
    data.draft = items;
  }
  async function shareCollection(items: Moment[]) {
    try {
      notify(
        (await copy(collectionUrl({ v: 1, title: '精彩时刻合集', items }, location.href)))
          ? '合集链接已复制'
          : '请手动复制链接',
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }
  function readShared() {
    data.shared = null;
    data.collection = null;
    data.error = '';
    try {
      const params = new URLSearchParams(location.hash.slice(1));
      if (params.has('moment')) data.shared = decodeMoment(params.get('moment'));
      if (params.has('collection')) {
        data.collection = decodeCollection(params.get('collection'));
        data.shared = data.collection.items[0];
      }
      pendingShared = !!data.shared;
      pendingReceivedNotice = !!data.shared;
      data.panelTab = data.shared ? 'received' : 'own';
      data.panelOpen = false;
      data.activeKey = data.shared ? key(data.shared) : '';
    } catch (e) {
      data.error = (e as Error).message;
    }
  }
  onMounted(() => {
    if (users++ > 0) return;
    syncLibrary();
    window.addEventListener('storage', onStorage);
    try {
      const draft = JSON.parse(
        localStorage.getItem(`share-draft-v1:${channel.channelId}`) || 'null',
      );
      if (draft) {
        data.draft = draft.items.slice(0, 20).map(validateMoment);
        data.title = String(draft.title).slice(0, 60);
      }
    } catch {
      data.draft = [];
    }
    readShared();
    window.addEventListener('hashchange', readShared);
    sample();
    timer = setInterval(sample, 500);
  });
  onBeforeUnmount(() => {
    cancelSeek?.();
    if (--users === 0) {
      clearInterval(timer);
      window.removeEventListener('hashchange', readShared);
      window.removeEventListener('storage', onStorage);
    }
  });
  return {
    data,
    sharedReason,
    enableSharedPlayback,
    ownMoments,
    orderedMoments,
    setOrder,
    pauseToast,
    resumeToast,
    availability,
    save,
    share,
    seek,
    backLive,
    remove,
    undoSave,
    updateNote,
    add,
    move,
    shareCollection,
    key,
  };
}
