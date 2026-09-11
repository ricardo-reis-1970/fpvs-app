<script setup>
import { useFpvsStore } from '../stores/fpvs'

const store = useFpvsStore()
</script>

<template>
  <main>
    <h1>FPVS — setup</h1>

    <form @submit.prevent="store.go('run')">
      <p>
        <label>
          Base rate (Hz)
          <input
            v-model.number="store.baseRateHz"
            type="number"
            min="1"
            max="30"
            step="0.5"
            required
          />
        </label>
      </p>
      <p>
        <label>
          Oddball every Nth stimulus
          <input
            v-model.number="store.oddballEvery"
            type="number"
            min="2"
            max="20"
            step="1"
            required
          />
        </label>
      </p>
      <p>
        <label>
          Sequence length (s)
          <input
            v-model.number="store.sequenceLengthS"
            type="number"
            min="5"
            max="600"
            step="5"
            required
          />
        </label>
      </p>

      <fieldset>
        <legend>Stimulus set</legend>
        <img
          v-for="s in store.stimuli"
          :key="s.id"
          :src="s.url"
          :alt="s.id"
          width="80"
          height="80"
        />
      </fieldset>

      <button type="submit">Start run</button>
    </form>

    <section>
      <h2>Derived</h2>
      <ul>
        <li>Stimulus period: {{ store.periodMs.toFixed(2) }} ms</li>
        <li>
          Base response at {{ store.baseRateHz }} Hz → oddball response at
          {{ store.oddballRateHz.toFixed(2) }} Hz
        </li>
        <li>
          {{ store.totalStimuli }} stimuli in {{ store.cycleCount }} cycles ≈
          {{ store.totalDurationS.toFixed(1) }} s
        </li>
      </ul>
    </section>
  </main>
</template>