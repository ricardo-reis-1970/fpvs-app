<script setup>
import { useFpvsStore } from './stores/fpvs'
import ResultsView from './components/ResultsView.vue'
import RunView from './components/RunView.vue'
import SetupView from './components/SetupView.vue'

const store = useFpvsStore()

const views = { setup: SetupView, run: RunView, results: ResultsView }
</script>

<template>
  <component :is="views[store.view]" />
</template>