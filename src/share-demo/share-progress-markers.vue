<template>
  <div
    ref="track"
    class="share-progress-markers"
  >
    <div
      v-for="group in groups"
      :key="key(group[0])"
      class="share-marker-group"
      :class="{
        'is-received': group.some(isReceived),
        'is-new': group.some(
          m => (data.lit && data.lastMarkedKey === key(m)) || data.highlightKey === key(m),
        ),
      }"
      :style="{ left: `${(group[0].time / data.state.duration) * 100}%` }"
      @mousedown.stop
      @mouseup.stop
      @pointerdown.stop
      @touchstart.stop
      @touchend.stop
      @mouseenter="emit('hover', true)"
      @mouseleave="emit('hover', false)"
      @focusin="emit('hover', true)"
      @focusout="emit('hover', false)"
    >
      <button
        class="share-progress-marker"
        :aria-label="
          group.length > 1
            ? `${group.length} 个相邻时刻`
            : `${isReceived(group[0]) ? '收到的时刻' : '我的时刻'} ${formatTime(group[0].time)}`
        "
        @click.stop="
          group.length === 1
            ? selectMoment(group[0])
            : (expanded = expanded === key(group[0]) ? '' : key(group[0]))
        "
      >
        <span class="share-progress-marker-dot"></span>
      </button>
      <div
        class="share-progress-marker-tip"
        :class="{
          'is-expanded': expanded === key(group[0]),
          'at-start': group[0].time / data.state.duration < 0.15,
          'at-end': group[0].time / data.state.duration > 0.85,
        }"
      >
        <button
          v-for="moment in group"
          :key="key(moment)"
          @click.stop="
            selectMoment(moment);
            expanded = '';
          "
        >
          💡 {{ formatTime(moment.time) }}{{ moment.note ? ' · ' + moment.note : '' }}
        </button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useShare, Moment } from './use-share';
import { formatTime } from './moments';
import { contextualMarkers } from './moment-library';
const emit = defineEmits<{ (event: 'hover', value: boolean): void }>();
const { data, key, seek, availability } = useShare();
const track = ref<HTMLElement | null>(null);
const width = ref(600);
const expanded = ref('');
const received = computed(() => data.collection?.items || (data.shared ? [data.shared] : []));
function isReceived(moment: Moment & { received?: boolean }) {
  return moment.received === true;
}
function selectMoment(moment: Moment) {
  if (isReceived(moment)) {
    data.shared = moment;
    data.panelTab = 'received';
  } else {
    data.panelTab = 'own';
  }
  seek(moment);
}
let observer: ResizeObserver | undefined;
const groups = computed(() => {
  const result: Moment[][] = [];
  if (!(data.state.duration > 0)) return result;
  const markers = contextualMarkers(data.saved, received.value, data.panelTab)
    .filter(m => !availability(m, data.state))
    .slice()
    .sort((a, b) => a.time - b.time);
  for (const moment of markers) {
    const previous = result[result.length - 1];
    if (previous && ((moment.time - previous[0].time) / data.state.duration) * width.value < 24)
      previous.push(moment);
    else result.push([moment]);
  }
  return result;
});
function close(event: Event) {
  if (!track.value?.contains(event.target as Node)) expanded.value = '';
}
onMounted(() => {
  observer = new ResizeObserver(entries => {
    width.value = entries[0].contentRect.width;
  });
  if (track.value) observer.observe(track.value);
  document.addEventListener('pointerdown', close);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  document.removeEventListener('pointerdown', close);
});
</script>
<style lang="scss">
.share-progress-markers {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}
.share-marker-group {
  position: absolute;
  top: 50%;
  width: 22px;
  height: 26px;
  pointer-events: auto;
  transform: translate(-50%, -50%);
}
.share-progress-marker {
  width: 22px;
  height: 26px;
  padding: 0;
  pointer-events: auto;
  cursor: pointer;
  background: transparent;
  border: 0;
}
.share-progress-marker-dot {
  display: block;
  width: 9px;
  height: 9px;
  padding: 0;
  margin: auto;
  font-size: 9px;
  line-height: 12px;
  color: #755000;
  background: #ffd45b;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
.share-progress-marker-tip {
  position: absolute;
  bottom: 22px;
  left: 50%;
  display: none;
  padding: 7px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: #303744;
  white-space: nowrap;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
  transform: translateX(-50%);
}
.share-progress-marker-tip.at-start {
  left: 0;
  transform: none;
}
.share-progress-marker-tip.at-end {
  right: 0;
  left: auto;
  transform: none;
}
.share-marker-group:hover .share-progress-marker-tip,
.share-marker-group:focus-within .share-progress-marker-tip,
.share-progress-marker-tip.is-expanded {
  display: block;
}
.share-progress-marker:focus-visible {
  border-radius: 4px;
  outline: 2px solid #ffd45b;
  outline-offset: 2px;
}
.share-marker-group.is-new .share-progress-marker-dot {
  animation: share-marker-pulse 0.7s ease-out 3;
}
@keyframes share-marker-pulse {
  50% {
    box-shadow: 0 0 0 7px rgba(255, 212, 91, 0.25);
    transform: scale(1.2);
  }
}
@media (prefers-reduced-motion: reduce) {
  .share-marker-group.is-new .share-progress-marker-dot {
    animation: none;
  }
}
.share-progress-marker-tip button {
  display: block;
  width: 100%;
  padding: 7px 2px;
  font-size: 12px;
  color: #53627a;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}
.share-progress-marker-tip button:hover {
  color: #3478f6;
  background: #f1f5fb;
}
.share-progress-marker-tip {
  max-height: 160px;
  overflow: auto;
}
</style>

<style lang="scss">
.share-marker-group.is-received .share-progress-marker-dot {
  background: #6da2ff;
}
</style>
