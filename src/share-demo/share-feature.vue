<template>
  <div
    ref="root"
    :class="['share-feature', `share-feature--${mode}`]"
  >
    <template v-if="mode === 'bulb'">
      <button
        v-if="data.playbackNotice"
        class="share-autoplay-prompt"
        :class="{ 'share-autoplay-prompt--muted': data.playbackNotice === 'muted' }"
        :title="data.playbackNotice === 'muted' ? '开启声音' : '点击播放这一刻'"
        :aria-label="data.playbackNotice === 'muted' ? '开启声音' : '点击播放这一刻'"
        @click.stop="enableSharedPlayback"
      >
        <svg
          v-if="data.playbackNotice === 'muted'"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="m16 9 6 6m0-6-6 6" />
        </svg>
        <span v-else>点击播放这一刻</span>
      </button>
      <button
        class="share-bulb"
        :class="{ 'share-bulb--lit': data.lit }"
        title="记录当前时刻"
        aria-label="记下这一刻"
        @click.stop="save()"
      >
        <svg
          class="share-bulb-art"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
          fill="currentColor"
        >
          <path
            d="M12 2a7 7 0 0 0-4.5 12.36C8.45 15.15 9 16.15 9 17.3V18h6v-.7c0-1.15.55-2.15 1.5-2.94A7 7 0 0 0 12 2Z"
          />
          <path d="M9 19h6v1a1 1 0 0 1-1 1h-1a1 1 0 0 1-2 0h-1a1 1 0 0 1-1-1Z" />
        </svg>
      </button>
      <button
        class="share-count"
        :title="receivedMoments.length ? '查看时刻' : '查看我的时刻'"
        :aria-label="receivedMoments.length ? '查看时刻' : '查看我的时刻'"
        :aria-expanded="opened"
        @click.stop="opened = !opened"
      >
        <span class="share-count-number">{{
          receivedMoments.length && data.panelTab === 'received'
            ? receivedMoments.length
            : ownMoments.length
        }}</span
        ><span
          class="share-count-arrow"
          aria-hidden="true"
          >▾</span
        >
      </button>
      <div
        v-if="data.toast && !opened"
        class="share-toast"
        role="status"
        @mouseenter="pauseToast"
        @mouseleave="resumeToast"
        @focusin="pauseToast"
        @focusout="resumeToast"
      >
        <span
          class="share-toast-icon"
          aria-hidden="true"
        ></span>
        <span class="share-toast-text">{{ data.toast }}</span>
        <button
          v-if="data.receivedToast"
          class="share-toast-action"
          @click="
            data.panelTab = 'received';
            data.panelOpen = true;
            data.toast = '';
            data.receivedToast = false;
          "
        >
          查看
        </button>
        <button
          v-if="data.toastMoment"
          class="share-toast-action"
          @click="share(data.toastMoment)"
        >
          分享
        </button>
        <button
          v-if="data.undo"
          @click="undoSave"
        >
          撤销
        </button>
      </div>
      <div
        v-if="data.fallback"
        class="share-copy"
      >
        <label
          >复制链接
          <input
            :value="data.fallback"
            readonly
            @focus="selectLink" /></label
        ><button @click="data.fallback = ''">关闭</button>
      </div>
    </template>
    <template v-else-if="mode === 'banner'">
      <div
        v-if="data.error"
        class="share-receiver"
      >
        {{ data.error }}
      </div>
    </template>
    <section
      v-if="mode === 'panel' || (mode === 'bulb' && opened)"
      class="share-popover"
      aria-label="时刻列表"
      @click.stop
    >
      <div
        v-if="data.toast"
        class="share-panel-notice"
        role="status"
        @mouseenter="pauseToast"
        @mouseleave="resumeToast"
        @focusin="pauseToast"
        @focusout="resumeToast"
      >
        <span>{{ data.toast }}</span>
        <button
          v-if="data.toastMoment"
          @click="share(data.toastMoment)"
        >
          分享
        </button>
        <button
          v-if="data.undo"
          @click="undoSave"
        >
          撤销
        </button>
      </div>
      <div
        v-if="receivedMoments.length"
        class="share-tabs"
        role="tablist"
        aria-label="时刻来源"
      >
        <button
          role="tab"
          :aria-selected="data.panelTab === 'received'"
          :class="{ 'is-active': data.panelTab === 'received' }"
          @click="
            data.panelTab = 'received';
            editKey = '';
          "
        >
          收到的时刻 · {{ receivedMoments.length }}
        </button>
        <button
          role="tab"
          :aria-selected="data.panelTab === 'own'"
          :class="{ 'is-active': data.panelTab === 'own' }"
          @click="data.panelTab = 'own'"
        >
          我的时刻 · {{ ownMoments.length }}
        </button>
      </div>
      <div
        v-if="receivedMoments.length && data.panelTab === 'received'"
        role="tabpanel"
        aria-label="收到的时刻"
      >
        <article
          v-for="(moment, index) in receivedMoments"
          :key="index"
          class="share-moment share-received-row"
          :class="{ 'is-active': data.activeKey === key(moment) }"
        >
          <span class="share-received-index">{{ index + 1 }}</span>
          <button
            class="share-moment-time"
            :disabled="!!availability(moment, data.state)"
            @click="
              data.shared = moment;
              seek(moment);
            "
          >
            ▶ {{ formatTime(moment.time) }}
          </button>
          <span
            class="share-moment-label"
            :title="moment.note"
            >{{ moment.note || '精彩时刻' }}</span
          >
          <button
            class="share-row-icon"
            :title="isSaved(moment) ? '已收藏' : '收藏到我的时刻'"
            :data-action-tip="isSaved(moment) ? '已收藏' : '收藏到我的时刻'"
            :aria-label="isSaved(moment) ? '已收藏' : '收藏到我的时刻'"
            :disabled="isSaved(moment)"
            @click="save(moment)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              :fill="isSaved(moment) ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 3h12v18l-6-4-6 4V3Z" />
            </svg>
          </button>
          <p
            v-if="availability(moment, data.state)"
            class="share-item-status"
          >
            {{ availability(moment, data.state) }}
          </p>
        </article>
        <button
          v-if="data.state.status === 'live'"
          :disabled="!data.state.ready || !data.state.authorized"
          @click="backLive"
        >
          回到直播
        </button>
      </div>
      <div
        v-else
        role="tabpanel"
        aria-label="我的时刻"
      >
        <div class="share-panel-head">
          <span
            >我的时刻 <small>{{ ownMoments.length }}</small></span
          >
          <button
            class="share-collection-icon"
            title="分享时刻合集"
            data-action-tip="分享时刻合集"
            aria-label="分享时刻合集"
            :disabled="!orderedMoments.length || orderedMoments.length > 20"
            @click="shareCollection(orderedMoments)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m8.2 10.7 7.5-4.4m-7.5 7 7.5 4.4" />
              <circle
                cx="6"
                cy="12"
                r="2.5"
              />
              <circle
                cx="18"
                cy="5"
                r="2.5"
              />
              <circle
                cx="18"
                cy="19"
                r="2.5"
              />
            </svg>
          </button>
          <select
            v-model="sortOrder"
            aria-label="时刻排序"
          >
            <option value="desc">时间降序</option>
            <option value="asc">时间升序</option>
            <option
              value="custom"
              disabled
            >
              自定义顺序
            </option>
          </select>
        </div>
        <p
          v-if="!ownMoments.length"
          class="share-empty"
        >
          看到精彩，点一下 💡<br />记下这一刻，随时回来分享。
        </p>
        <article
          v-for="(moment, index) in orderedMoments"
          :key="key(moment)"
          class="share-moment"
          :class="{ 'is-active': data.activeKey === key(moment) }"
          :data-moment-key="key(moment)"
          :draggable="editKey !== key(moment)"
          @dragstart="startDrag($event, index)"
          @dragover.prevent
          @drop.prevent="dropAt(index)"
          @dragend="dragIndex = -1"
        >
          <span
            class="share-drag-handle"
            title="拖动调整顺序"
            aria-hidden="true"
            >⠿</span
          >
          <button
            class="share-moment-time"
            :disabled="!!availability(moment, data.state)"
            @click="seek(moment)"
          >
            ▶ {{ formatTime(moment.time) }}
          </button>
          <div
            v-if="editKey !== key(moment)"
            class="share-note"
          >
            <span
              class="share-moment-label"
              :title="moment.note"
              >{{ moment.note || '记录于 ' + formatTime(moment.time) }}</span
            >
            <button
              class="share-note-edit share-row-icon"
              title="编辑备注"
              data-action-tip="编辑备注"
              :aria-label="`编辑备注 ${formatTime(moment.time)}`"
              @click="editNote(moment)"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m15 3 6 6-12 11H3v-6L15 3ZM4 22h18m-6-7h5" />
              </svg>
            </button>
          </div>
          <form
            v-else
            class="share-note-form"
            @submit.prevent="commitNote(moment)"
            @keydown.esc.stop.prevent="editKey = ''"
          >
            <input
              v-model="noteDraft"
              class="share-note-input"
              aria-label="时刻备注"
              maxlength="20"
              placeholder="添加备注，最多 20 字"
              @keydown.esc.stop.prevent="editKey = ''"
              @keydown.stop
            />
            <button type="submit">保存</button>
            <button
              type="button"
              @click="editKey = ''"
            >
              取消
            </button>
          </form>
          <p
            v-if="availability(moment, data.state)"
            class="share-item-status"
          >
            {{ availability(moment, data.state) }}
          </p>
          <div class="share-actions">
            <button
              class="share-row-icon"
              title="分享这一刻"
              data-action-tip="分享这一刻"
              :aria-label="`分享这一刻 ${formatTime(moment.time)}`"
              @click="share(moment)"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m8.2 10.7 7.5-4.4m-7.5 7 7.5 4.4" />
                <circle
                  cx="6"
                  cy="12"
                  r="2.5"
                />
                <circle
                  cx="18"
                  cy="5"
                  r="2.5"
                />
                <circle
                  cx="18"
                  cy="19"
                  r="2.5"
                />
              </svg>
            </button>
            <button
              class="share-row-icon share-remove-icon"
              title="移除"
              data-action-tip="移除"
              :aria-label="`移除 ${formatTime(moment.time)}`"
              @click="remove(moment)"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M3 6h18M8 6l1-3h6l1 3M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6M9 11v6m6-6v6"
                />
              </svg>
            </button>
          </div>
        </article>
        <p
          v-if="orderedMoments.length > 20"
          class="share-hint"
        >
          合集最多支持 20 个时刻，请先移除部分记录
        </p>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useShare, Moment } from './use-share';
import { formatTime } from './moments';
const props = defineProps<{ mode: 'bulb' | 'panel' | 'banner' }>();
const {
  data,
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
  shareCollection,
  key,
} = useShare();
const emit = defineEmits<{ (event: 'open-change', value: boolean): void }>();
const root = ref<HTMLElement | null>(null);
const receivedMoments = computed(
  () => data.collection?.items || (data.shared ? [data.shared] : []),
);
function isSaved(moment: Moment) {
  return data.saved.some(m => key(m) === key(moment));
}
const editKey = ref('');
const noteDraft = ref('');
async function editNote(moment: Moment) {
  editKey.value = key(moment);
  noteDraft.value = moment.note || '';
  await nextTick();
  root.value?.querySelector<HTMLInputElement>('.share-note-input')?.focus();
}
function commitNote(moment: Moment) {
  updateNote(moment, noteDraft.value);
  editKey.value = '';
}
const sortOrder = computed({
  get: () => data.order.mode,
  set: (mode: string) => setOrder(mode),
});
const dragIndex = ref(-1);
function startDrag(event: DragEvent, index: number) {
  dragIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key(orderedMoments.value[index]));
  }
}
function dropAt(index: number) {
  if (dragIndex.value < 0) return;
  const items = orderedMoments.value.slice();
  const [moved] = items.splice(dragIndex.value, 1);
  items.splice(index, 0, moved);
  setOrder('custom', items.map(key));
  dragIndex.value = -1;
}
const opened = computed({
  get: () => data.panelOpen,
  set: (value: boolean) => {
    data.panelOpen = value;
  },
});
watch(
  () => opened.value || !!data.toast || !!data.fallback || data.playbackNotice === 'blocked',
  value => emit('open-change', value),
);
function close() {
  opened.value = false;
  editKey.value = '';
}
function outside(event: PointerEvent) {
  const target = event.target as Element;
  if (
    props.mode === 'bulb' &&
    !root.value?.contains(target) &&
    !target.closest('.share-progress-markers') &&
    !target.closest('.share-received-hint')
  )
    close();
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Escape' && opened.value) {
    close();
    root.value?.querySelector<HTMLButtonElement>('.share-count')?.focus();
  }
}
watch(
  () => data.activeKey,
  async () => {
    await nextTick();
    root.value?.querySelector('.share-moment.is-active')?.scrollIntoView({ block: 'nearest' });
  },
);
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('keydown', escape);
});
function selectLink(event: FocusEvent) {
  (event.target as HTMLInputElement)?.select();
}
</script>
<style lang="scss">
.share-feature {
  font-size: 13px;
  color: #303744;
}
.share-feature button {
  padding: 6px;
  font: inherit;
  color: #53627a;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}
.share-feature button:hover {
  color: #3478f6;
  background: #f1f5fb;
}
.share-feature button:disabled {
  cursor: default;
  opacity: 0.4;
}
.share-feature--bulb {
  display: inline-flex;
  align-items: center;
  margin: 0 12px;
}
.share-feature .share-bulb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
}
.share-feature .share-bulb--lit {
  color: #d99a12;
  background: #fff6d9;
}
.share-toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  z-index: 9999;
  padding: 12px 20px;
  background: white;
  border: 1px solid #e8ebf0;
  border-radius: 9px;
  box-shadow: 0 5px 24px #192c4720;
  transform: translateX(-50%);
}
.share-copy {
  position: fixed;
  bottom: 85px;
  left: 25%;
  z-index: 9999;
  width: 50%;
  padding: 12px;
  background: white;
  border: 1px solid #e8ebf0;
}
.share-feature input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px;
  margin-top: 8px;
  color: #303744;
  background: white;
  border: 1px solid #dfe5ed;
  border-radius: 6px;
}
.share-feature--panel {
  box-sizing: border-box;
  height: 100%;
  padding: 16px;
  overflow: auto;
  background: white;
}
.share-panel-head,
.share-draft-row {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
}
.share-panel-head small {
  margin-left: 6px;
  color: #929baa;
}
.share-empty {
  padding: 50px 0;
  line-height: 2;
  color: #929baa;
  text-align: center;
}
.share-moment {
  padding: 14px 0;
  border-bottom: 1px solid #edf0f4;
}
.share-feature .share-moment-time {
  padding-left: 0;
  font-weight: 600;
  color: #3478f6;
}
.share-moment p {
  margin: 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.share-actions {
  display: flex;
  gap: 8px;
}
.share-editor {
  padding-top: 14px;
  margin-top: 18px;
  border-top: 1px solid #edf0f4;
}
.share-hint {
  margin: 10px 0;
  font-size: 12px;
  line-height: 1.6;
  color: #929baa;
}
.share-feature .share-collection-copy {
  width: 100%;
  margin-top: 12px;
  color: #3478f6;
  border: 1px solid #dce6f7;
}
.share-receiver {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 16px;
  background: #fff;
  border-top: 1px solid #edf0f4;
}
.share-receiver-items {
  flex-basis: 100%;
}
</style>

<style lang="scss">
.share-unavailable {
  flex-basis: 100%;
  font-size: 12px;
  line-height: 1.7;
  color: #8a6430;
}
.share-moment .share-item-status {
  font-size: 12px;
  line-height: 1.6;
  color: #8a6430;
  white-space: normal;
}
</style>

<style lang="scss">
.share-float-layer {
  z-index: 12;
}
.share-float.share-feature--bulb {
  position: absolute;
  top: calc(50% - 22px);
  right: 16px;
  margin: 0;
  pointer-events: auto;
}
.share-float .share-bulb {
  position: relative;
  width: 44px;
  height: 44px;
  color: #ffcd22;
  background: transparent;
  border: 0;
  border-radius: 14px;
  box-shadow: none;
}
.share-float .share-bulb:hover,
.share-float .share-bulb:focus-visible {
  color: #ffe27a;
  background: transparent;
  box-shadow: none;
}
.share-float .share-bulb:focus-visible {
  outline: 2px solid #ffd45b;
  outline-offset: 3px;
}
.share-float .share-bulb--lit {
  color: #ffdf5e;
  background: transparent;
}
.share-float .share-bulb-art {
  flex-shrink: 0;
  overflow: visible;
  filter: drop-shadow(0 3px 2px rgba(58, 34, 0, 0.35));
  transition: filter 0.18s, transform 0.18s;
}
.share-float .share-bulb-rays {
  opacity: 0.85;
  stroke: #ffe296;
  stroke-width: 1.8;
}
.share-float .share-bulb:hover .share-bulb-art,
.share-float .share-bulb:focus-visible .share-bulb-art,
.share-float .share-bulb--lit .share-bulb-art {
  filter: drop-shadow(0 4px 3px rgba(58, 34, 0, 0.3)) drop-shadow(0 0 5px rgba(255, 205, 34, 0.55));
  transform: scale(1.08);
}
.share-float .share-bulb:active .share-bulb-art {
  filter: drop-shadow(0 1px 1px rgba(58, 34, 0, 0.3));
  transform: translateY(1px) scale(0.94);
}
@media (prefers-reduced-motion: reduce) {
  .share-float .share-bulb-art,
  .share-float .share-bulb-glass {
    transition: none;
  }
}
.share-float .share-bulb::after {
  position: absolute;
  top: 50%;
  right: calc(100% + 10px);
  display: none;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: #303744;
  white-space: nowrap;
  content: '记录当前时刻';
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.16);
  transform: translateY(-50%);
}
.share-float .share-bulb:hover::after,
.share-float .share-bulb:focus-visible::after {
  display: block;
}
</style>

<style lang="scss">
.share-float .share-count {
  min-width: 40px;
  height: 32px;
  margin-left: 2px;
  color: #fff;
  background: rgba(35, 39, 46, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 16px;
}
.share-float .share-count:hover {
  color: #ffe298;
  background: rgba(35, 39, 46, 0.85);
}
.share-popover {
  width: 310px;
  padding: 14px;
  color: #303744;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.share-float .share-popover {
  position: absolute;
  top: 50%;
  right: calc(100% + 10px);
  box-sizing: border-box;
  max-width: calc(100vw - 150px);
  max-height: min(380px, 65vh);
  overflow: auto;
  overscroll-behavior: contain;
  transform: translateY(-50%);
}
.share-popover .share-panel-head {
  position: sticky;
  top: -14px;
  z-index: 1;
  padding: 6px 0 10px;
  background: #fff;
}
.share-popover .share-moment {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  padding: 8px 4px;
  border-radius: 6px;
}
.share-popover .share-moment.is-active {
  background: #fff6dc;
}
.share-popover .share-moment-label {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #89909b;
}
.share-popover .share-item-status {
  order: 3;
  width: 100%;
}
.share-popover .share-actions {
  flex-shrink: 0;
  gap: 2px;
  justify-content: flex-end;
  padding: 0;
  background: transparent;
  border-radius: 6px;
}
.share-popover .share-add {
  order: 4;
  width: 100%;
  text-align: right;
}
.share-popover .share-editor {
  padding-top: 10px;
}
</style>

<style lang="scss">
.share-control.share-float.share-feature--bulb {
  position: relative;
  top: auto;
  right: auto;
  box-sizing: border-box;
  align-self: center;
  height: 24px;
  margin: 0 12px;
  background: rgba(0, 0, 0, 0.38);
  border: 1px solid #fff;
  border-radius: 12px;
}
.share-control.share-float .share-bulb {
  box-sizing: border-box;
  width: 29px;
  height: 22px;
  padding: 3px 3px 3px 10px;
  color: #ffd15c;
  background: transparent;
  border-radius: 11px 0 0 11px;
}
.share-control.share-float .share-bulb-art,
.share-control.share-float .share-bulb:hover .share-bulb-art,
.share-control.share-float .share-bulb:focus-visible .share-bulb-art,
.share-control.share-float .share-bulb:active .share-bulb-art,
.share-control.share-float .share-bulb--lit .share-bulb-art {
  width: 16px;
  height: 16px;
  filter: none;
  transform: none;
}
.share-control.share-float .share-count {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 22px;
  padding: 0 10px 0 3px;
  margin: 0;
  font-size: 12px;
  line-height: 1;
  color: #fff;
  background: transparent;
  border: 0;
  border-radius: 0 11px 11px 0;
}
.share-control .share-count-arrow {
  font-size: 8px;
}
.share-control.share-float .share-bulb:hover,
.share-control.share-float .share-bulb:focus-visible,
.share-control.share-float .share-count:hover,
.share-control.share-float .share-count:focus-visible {
  background: rgba(255, 255, 255, 0.12);
}
.share-control.share-float .share-bulb--lit {
  color: #ffe69c;
}
.share-control.share-float .share-popover {
  top: auto;
  right: auto;
  bottom: calc(100% + 18px);
  left: 0;
  z-index: 6;
  max-height: min(350px, 55vh);
  transform: none;
}
.share-control.share-float .share-bulb::after {
  top: auto;
  right: 0;
  bottom: calc(100% + 12px);
  transform: none;
}
</style>

<style lang="scss">
.share-control .share-toast {
  position: absolute;
  bottom: calc(100% + 18px);
  left: 0;
  box-sizing: border-box;
  display: flex;
  gap: 10px;
  align-items: center;
  width: max-content;
  max-width: min(360px, 65vw);
  min-height: 48px;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 20px;
  color: #303744;
  background: #fff;
  border: 1px solid #dcdcdc;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  transform: none;
}
.share-toast-icon {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  background: url('../hooks/components/use-toast/_components/imgs/toast-info.svg') center / contain
    no-repeat;
}
.share-toast-text {
  flex: 1;
}
.share-control .share-toast button {
  flex-shrink: 0;
  padding: 4px;
}
.share-control .share-toast .share-toast-action {
  font-weight: 600;
  color: #3478f6;
}
.share-control .share-copy {
  position: absolute;
  bottom: calc(100% + 80px);
  left: 0;
  box-sizing: border-box;
  width: 300px;
  max-width: 65vw;
}
</style>

<style lang="scss">
.share-panel-head select {
  padding: 4px;
  font-size: 12px;
  color: #667085;
  background: transparent;
  border: 0;
}
.share-drag-handle {
  color: #98a1ae;
  cursor: grab;
}
</style>

<style lang="scss">
.share-note {
  display: flex;
  flex: 1;
  gap: 4px;
  align-items: center;
  min-width: 0;
}
.share-note .share-moment-label {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.share-note-edit {
  opacity: 0;
}
.share-moment:hover .share-note-edit,
.share-moment:focus-within .share-note-edit {
  opacity: 1;
}
.share-note-form {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 120px;
}
.share-note-form .share-note-input {
  width: 100%;
  padding: 5px;
  margin: 0;
}
@media (hover: none) {
  .share-note-edit {
    opacity: 1;
  }
}
</style>

<style lang="scss">
.share-panel-head .share-collection-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 4px;
  margin-right: auto;
}
</style>

<style lang="scss">
.share-popover .share-row-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 28px;
  padding: 4px;
}
.share-popover .share-remove-icon:hover {
  color: #d94a4a;
  background: #fff0f0;
}
</style>

<style lang="scss">
.share-popover .share-note-edit {
  width: 20px;
  height: 24px;
  padding: 3px;
  color: #a0a7b2;
}
.share-popover .share-note-edit svg {
  width: 14px;
  height: 14px;
  stroke-width: 1.5;
}
.share-popover .share-note-edit:hover {
  color: #3478f6;
  background: transparent;
}
</style>

<style lang="scss">
.share-feature [data-action-tip] {
  position: relative;
}
.share-feature [data-action-tip]::after {
  position: absolute;
  right: 0;
  bottom: calc(100% + 5px);
  z-index: 5;
  display: none;
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
  content: attr(data-action-tip);
  background: rgba(35, 39, 46, 0.94);
  border-radius: 4px;
}
.share-feature [data-action-tip]:hover::after,
.share-feature [data-action-tip]:focus-visible::after {
  display: block;
}
.share-panel-head [data-action-tip]::after {
  top: calc(100% + 5px);
  right: auto;
  bottom: auto;
  left: 0;
}
</style>

<style lang="scss">
.share-feature--banner .share-receiver {
  gap: 10px;
  padding: 14px 18px;
  margin: 10px 0;
  background: #f8faff;
  border: 1px solid #e5ebf5;
  border-radius: 10px;
}
.share-receiver-heading {
  display: flex;
  flex: 1;
  gap: 10px;
  align-items: center;
  min-width: 170px;
}
.share-receiver-heading strong {
  font-size: 14px;
  font-weight: 500;
  color: #303744;
}
.share-receiver-count {
  font-size: 12px;
  color: #8993a3;
}
.share-feature .share-receiver-play {
  padding: 6px 10px;
  color: #3478f6;
  background: #eaf1ff;
}
.share-feature .share-receiver-save {
  font-size: 12px;
  color: #667085;
}
.share-receiver-items {
  display: flex;
  gap: 8px;
  padding-top: 2px;
  overflow-x: auto;
}
.share-feature .share-receiver-chip {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
  padding: 7px 10px;
  font-size: 13px;
  background: #fff;
  border: 1px solid #e1e6ee;
  border-radius: 6px;
}
.share-feature .share-receiver-chip.is-selected {
  color: #286be3;
  background: #eaf1ff;
  border-color: #8db4ff;
}
.share-receiver-index {
  font-size: 11px;
  opacity: 0.6;
}
.share-receiver-note {
  width: 100%;
  margin: 0;
  font-size: 13px;
  color: #53627a;
}
</style>

<style lang="scss">
.share-received-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  margin: 8px 0;
  font-size: 14px;
  line-height: 22px;
  color: #27436c;
  background: #edf4ff;
  border: 1px solid #cbdfff;
  border-left: 3px solid #3478f6;
  border-radius: 8px;
}
.share-received-hint-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: #3478f6;
  background: #dceaff;
  border-radius: 8px;
}
.share-received-hint-text {
  font-weight: 500;
}
.share-received-hint-text strong {
  color: #2464d2;
}
.share-feature .share-received-hint-action {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 7px 14px;
  margin-left: auto;
  font-weight: 500;
  color: #fff;
  background: #3478f6;
  border-radius: 6px;
}
.share-feature .share-received-hint-action:hover,
.share-feature .share-received-hint-action:focus-visible {
  color: #fff;
  background: #2464d2;
}
.share-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid #edf0f4;
}
.share-tabs button {
  padding: 8px 2px;
  font-size: 13px;
  border-bottom: 2px solid transparent;
  border-radius: 0;
}
.share-tabs button.is-active {
  color: #3478f6;
  border-bottom-color: #3478f6;
}
.share-received-index {
  font-size: 11px;
  color: #98a1ae;
}
.share-received-row .share-moment-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<style lang="scss">
.share-panel-notice {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  font-size: 12px;
  color: #53627a;
  background: #fff;
}
.share-panel-notice span {
  flex: 1;
}
</style>

<style lang="scss">
.share-feature .share-autoplay-prompt {
  position: absolute;
  bottom: calc(100% + 24px);
  left: 0;
  z-index: 8;
  padding: 8px 12px;
  color: #303744;
  white-space: nowrap;
  background: #fff;
  border: 1px solid #dfe5ed;
  border-radius: 6px;
}
.share-feature .share-autoplay-prompt--muted {
  bottom: calc(100% + 8px);
  left: -36px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border: 0;
  border-radius: 50%;
}
</style>
