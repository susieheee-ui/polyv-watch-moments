<template>
  <div :id="uniqueId">
    <direct-business-page-entry
      v-if="directBusinessPageType"
      @hook:mounted="onLayoutMounted"
    />
    <template v-if="!directBusinessPageType && watchAppInited">
      <pc-main
        v-if="!isMobile"
        @page-mounted="onLayoutMounted"
      />
      <mobile-main
        v-else
        @page-mounted="onLayoutMounted"
      />
    </template>

    <theme-select v-if="watchAppInited && paramGetter().debugSkin()" />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { useWatchApp } from './use-watch-app';
import { isMobile } from '@/assets/utils/browser';

import { useWatchAppStore } from '@/store/use-watch-app-store';
import { storeDefinitionToRefs } from '@/plugins/pinia/util';

import DirectBusinessPageEntry from './layout/direct-business-page/direct-business-page-entry.vue';
import { useGlobalInject } from './use-global-inject';
import { useQueryParams } from '@/hooks/core/use-query-params';

const { uniqueId } = useGlobalInject();
const { paramGetter } = useQueryParams();

const ThemeSelect = defineAsyncComponent(
  () => import(/* webpackChunkName: "theme-select" */ '@/themes/debug/theme-select.vue'),
);

const PcMain = defineAsyncComponent(
  () => import(/* webpackChunkName: "pc-main" */ './layout/main-enter/pc-main.vue'),
);
const MobileMain = defineAsyncComponent(
  () => import(/* webpackChunkName: "mobile-main" */ './layout/main-enter/mobile-main.vue'),
);

// eslint-disable-next-line no-unused-vars
const { onLayoutMounted, setupWatchApp } = useWatchApp();
// useCurrentWatchAppEffect(setupWatchApp);

const { directBusinessPageType, watchAppInited } = storeDefinitionToRefs(useWatchAppStore);
</script>

<style lang="scss" src="@/assets/styles/global.scss"></style>

<style lang="scss">
#app {
  width: 100%;
  height: 100%;
}
</style>
