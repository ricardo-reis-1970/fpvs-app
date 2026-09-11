<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useFpvsStore } from '../stores/fpvs'

const store = useFpvsStore()

// 'loading' → 'idle' → 'countdown' → 'running' → 'done' | 'aborted'
const phase = ref('loading')
const countdown = ref(0)
const progress = ref(0)
const shownIndex = ref(-1)
const stallMs = ref(0)

const stageEl = ref(null)
const imgEls = new Map() // stimulus.id -> <img>

let rafId = 0
let countdownTimer = 0
let startTimer = 0
let schedule = [] // stimulus id per position
let targets = [] // absolute perf-time target onsets
let nextIndex = 0
let log = []
let t0 = 0 // absolute perf-time of the first target onset
let lastFrameT = 0
let oddballId = null

const baseIds = computed(() => store.stimuli.filter((s) => s.id !== oddballId).map((s) => s.id))

function pickOddball() {
	const s = store.stimuli.find((x) => x.isOddball || x.oddball)
	return s ? s.id : store.stimuli[store.stimuli.length - 1].id
}

// Base order is random with no immediate repeats; every Nth slot is the oddball.
function buildSchedule() {
	const n = store.totalStimuli
	const every = store.oddballEvery
	const bases = baseIds.value
	const out = new Array(n)
	for (let i = 0; i < n; i++) {
		if ((i + 1) % every === 0) {
			out[i] = oddballId
		} else {
			let pick
			let guard = 0
			do {
				pick = bases[(Math.random() * bases.length) | 0]
			} while (i > 0 && pick === out[i - 1] && ++guard < 50)
			out[i] = pick
		}
	}
	return out
}

function showId(id) {
	const el = imgEls.get(id)
	if (el) el.classList.add('active')
}
function hideId(id) {
	const el = imgEls.get(id)
	if (el) el.classList.remove('active')
}
function clearActive() {
	for (const el of imgEls.values()) el.classList.remove('active')
}

// Tolerance against FP jitter between our t0 and the browser's frame clock.
const EARLY_TOL_MS = 1

function tick(frameT) {
	// A huge gap means the tab was hidden, GC paused the main thread, etc.
	// Bail rather than emitting a burst of fake onsets in one frame.
	if (lastFrameT && frameT - lastFrameT > 500) {
		stallMs.value = frameT - lastFrameT
		abort()
		return
	}
	lastFrameT = frameT

	const period = store.periodMs
	while (nextIndex < targets.length && frameT + EARLY_TOL_MS >= targets[nextIndex]) {
		const i = nextIndex
		const id = schedule[i]

		// Swap by toggling a class on two pre-loaded <img>s.
		// No Vue reactivity on the hot path — nothing between us and the frame.
		if (i > 0) hideId(schedule[i - 1])
		showId(id)

		const applyT = performance.now()
		log.push({
			index: i,
			position: i + 1,
			targetMs: i * period,
			onsetMs: applyT - t0,
			frameMs: frameT - t0,
			deltaMs: applyT - t0 - i * period,
			stimulusId: id,
			isOddball: id === oddballId,
		})
		nextIndex++
	}

	shownIndex.value = nextIndex - 1
	progress.value = targets.length ? nextIndex / targets.length : 1

	if (nextIndex < targets.length) {
		rafId = requestAnimationFrame(tick)
	} else {
		finish()
	}
}

function begin() {
	oddballId = pickOddball()
	schedule = buildSchedule()
	log = []
	nextIndex = 0
	progress.value = 0
	shownIndex.value = -1
	clearActive()

	const period = store.periodMs
	const n = schedule.length
	const leadIn = 2000 // ms of plain grey before the first stimulus
	t0 = performance.now() + leadIn

	targets = new Array(n)
	for (let i = 0; i < n; i++) targets[i] = t0 + i * period

	phase.value = 'countdown'
	const cd = () => {
		const left = t0 - performance.now()
		if (left > 0) {
			countdown.value = Math.ceil(left / 1000)
			countdownTimer = setTimeout(cd, 100)
		} else {
			countdown.value = 0
			phase.value = 'running'
			lastFrameT = 0
			rafId = requestAnimationFrame(tick)
		}
	}
	cd()
}

function finish() {
	phase.value = 'done'
	cancelAnimationFrame(rafId)
	store.setOnsetLog(log.slice())
	startTimer = setTimeout(() => store.go('results'), 400)
}

function abort() {
	cancelAnimationFrame(rafId)
	clearTimeout(countdownTimer)
	clearActive()
	phase.value = 'aborted'
	store.setOnsetLog(log.slice()) // partial run — Results should flag it
	startTimer = setTimeout(() => store.go('setup'), 1500)
}

function waitForImg(el) {
	return new Promise((res) => {
		if (el.complete && el.naturalWidth > 0) return res()
		el.addEventListener('load', res, { once: true })
		el.addEventListener('error', res, { once: true })
	})
}

onMounted(async () => {
	// Match rendered <img>s to stimuli by DOM order — avoids string/number id keys.
	const imgs = stageEl.value?.querySelectorAll('img.stim') ?? []
	store.stimuli.forEach((s, i) => {
		if (imgs[i]) imgEls.set(s.id, imgs[i])
	})

	await Promise.all([...imgEls.values()].map(waitForImg))
	// Force decode so the first swap doesn't stall on image decoding.
	await Promise.all(
		[...imgEls.values()].map((el) => (el.decode ? el.decode().catch(() => {}) : Promise.resolve())),
	)

	phase.value = 'idle'
	startTimer = setTimeout(begin, 500)
})

onBeforeUnmount(() => {
	cancelAnimationFrame(rafId)
	clearTimeout(countdownTimer)
	clearTimeout(startTimer)
	clearActive()
})
</script>

<template>
  <main class="run">
    <h1>FPVS — run</h1>

    <div class="stage" ref="stageEl">
      <img
        v-for="s in store.stimuli"
        :key="s.id"
        :src="s.url"
        :alt="s.id"
        class="stim"
        draggable="false"
      />
    </div>

    <div class="status">
      <p v-if="phase === 'loading'">Loading stimuli…</p>
      <p v-else-if="phase === 'idle'">Ready…</p>
      <p v-else-if="phase === 'countdown'">Starting in {{ countdown }}…</p>
      <p v-else-if="phase === 'running'">
        {{ shownIndex + 1 }} / {{ store.totalStimuli }}
      </p>
      <p v-else-if="phase === 'done'">
        Done — logged {{ store.onsetLog.length }} onsets.
      </p>
      <p v-else-if="phase === 'aborted'">
        Run aborted<span v-if="stallMs"> after a {{ Math.round(stallMs) }} ms stall</span>.
      </p>
    </div>

    <progress :value="progress" max="1"></progress>

    <p>
      <button
        v-if="phase === 'countdown' || phase === 'running'"
        type="button"
        @click="abort"
      >
        Abort
      </button>
    </p>
  </main>
</template>
