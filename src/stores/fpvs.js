import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { STIMULI } from '../lib/stimuli'

export const useFpvsStore = defineStore('fpvs', () => {
	// view switching replaces the router: 'setup' | 'run' | 'results'
	const view = ref('setup')

	// run configuration, edited from the Setup form
	const baseRateHz = ref(6)
	const oddballEvery = ref(5)
	const sequenceLengthS = ref(60)

	const stimuli = STIMULI

	// derived timing
	const periodMs = computed(() => 1000 / baseRateHz.value)
	const oddballRateHz = computed(() => baseRateHz.value / oddballEvery.value)

	// round the run to a whole number of oddball cycles so the stream
	// never ends mid-cycle (also cleaner for the later FFT check)
	const cycleCount = computed(() =>
		Math.max(1, Math.round((sequenceLengthS.value * baseRateHz.value) / oddballEvery.value)),
	)
	const totalStimuli = computed(() => cycleCount.value * oddballEvery.value)
	const totalDurationS = computed(() => totalStimuli.value / baseRateHz.value)

	// filled in by the Run view when a run finishes (or is aborted)
	const onsetLog = ref([])
	function setOnsetLog(entries) {
		onsetLog.value = entries
	}

	function go(next) {
		view.value = next
	}

	return {
		view,
		baseRateHz,
		oddballEvery,
		sequenceLengthS,
		stimuli,
		periodMs,
		oddballRateHz,
		cycleCount,
		totalStimuli,
		totalDurationS,
		onsetLog,
		setOnsetLog,
		go,
	}
})
