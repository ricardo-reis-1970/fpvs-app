<script setup>
import { computed } from 'vue'
import { useFpvsStore } from '../stores/fpvs'

const store = useFpvsStore()

const log = computed(() => store.onsetLog)
const hasData = computed(() => log.value.length >= 2)
const complete = computed(() => log.value.length >= store.totalStimuli)

// Target period comes from the log itself, so results don't drift if the
// user edits Setup between the run and viewing this page.
const targetPeriodMs = computed(() => {
  const l = log.value
  if (l.length < 2) return store.periodMs
  const dt = l[1].targetMs - l[0].targetMs
  return dt > 0 ? dt : store.periodMs
})
const baseHz = computed(() => 1000 / targetPeriodMs.value)
const oddballHz = computed(() => store.oddballRateHz)

// ---------- summary statistics ----------
const stats = computed(() => {
  const l = log.value
  if (l.length < 2) return null

  const target = targetPeriodMs.value
  const iois = []
  for (let i = 1; i < l.length; i++) iois.push(l[i].onsetMs - l[i - 1].onsetMs)

  const n = iois.length
  const mean = iois.reduce((a, b) => a + b, 0) / n
  const variance = n > 1 ? iois.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0
  const sd = Math.sqrt(variance)
  const minIoi = Math.min(...iois)
  const maxIoi = Math.max(...iois)

  // per-onset deviation from the ideal schedule (onsetMs - targetMs is logged)
  const deltas = l.map((e) => e.onsetMs - e.targetMs)
  const maxAbsDelta = Math.max(...deltas.map((x) => Math.abs(x)))

  const worstIoi = Math.max(Math.abs(maxIoi - target), Math.abs(minIoi - target))
  const realizedHz = 1000 / mean

  return {
    n,
    target,
    mean,
    sd,
    minIoi,
    maxIoi,
    worstIoi,
    deltas,
    maxAbsDelta,
    realizedHz,
    rateErrHz: realizedHz - baseHz.value,
    rateErrPct: (realizedHz / baseHz.value - 1) * 100,
    stimCount: l.length,
    oddballCount: l.filter((e) => e.isOddball).length,
  }
})

// ---------- frequency-domain check ----------
// The onset train is an impulse train, so its DFT can be evaluated directly
// without materialising a sampled signal: X(f) = Σ exp(-2πi f t_k) / N.
// At f = base rate every impulse contributes in phase → |X| ≈ 1.
// At f = base/5 only the oddballs align → |X| ≈ 1/5 (the classic FPVS peak).
function dftMag(ts, f, weights) {
  let re = 0
  let im = 0
  for (let i = 0; i < ts.length; i++) {
    const w = weights ? weights[i] : 1
    const a = -2 * Math.PI * f * ts[i]
    re += w * Math.cos(a)
    im += w * Math.sin(a)
  }
  return Math.hypot(re, im) / ts.length
}

const spectrum = computed(() => {
  const l = log.value
  if (l.length < 16) return null
  const t0 = l[0].onsetMs
  const ts = l.map((e) => (e.onsetMs - t0) / 1000)
  // +1 for oddballs, -1 for base — this is what makes the 1.2 Hz peak appear
  const weights = l.map((e) => (e.isOddball ? 1 : -1))

  const fMax = Math.max(8, baseHz.value * 1.5)
  const N = 600
  const onsetPts = new Array(N)
  const oddPts = new Array(N)
  for (let i = 1; i <= N; i++) {
    const f = (i / N) * fMax
    onsetPts[i - 1] = { f, m: dftMag(ts, f) }
    oddPts[i - 1] = { f, m: dftMag(ts, f, weights) }
  }

  const medianOf = (pts) => {
    const s = pts.map((p) => p.m).sort((a, b) => a - b)
    return s[s.length >> 1] || 1e-6
  }

  return {
    ts, fMax,
    onsetPts, oddPts,
    onsetMedian: medianOf(onsetPts),
    oddMedian: medianOf(oddPts),
    baseMag: dftMag(ts, baseHz.value),
    wBaseMag: dftMag(ts, baseHz.value, weights),
    wOddMag: dftMag(ts, oddballHz.value, weights),
  }
})

// ---------- plot geometry ----------
const chart = computed(() => {
  const s = spectrum.value
  if (!s) return null
  const W = 660
  const H = 240
  const pad = { l: 52, r: 16, t: 14, b: 32 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const maxM = Math.max(...s.onsetPts.map((p) => p.m), ...s.oddPts.map((p) => p.m), 0.01)
  const x = (f) => pad.l + (f / s.fMax) * iw
  const y = (m) => pad.t + ih - (m / maxM) * ih
  const pathOf = (pts) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.f).toFixed(1)} ${y(p.m).toFixed(1)}`).join(' ')

  const markers = []
  if (baseHz.value <= s.fMax)
    markers.push({
      f: baseHz.value, x: x(baseHz.value), y: y(s.baseMag),
      label: `${baseHz.value.toFixed(2)} Hz (base)`,
    })
  if (oddballHz.value <= s.fMax)
    markers.push({
      f: oddballHz.value, x: x(oddballHz.value), y: y(s.wOddMag),
      label: `${oddballHz.value.toFixed(2)} Hz (oddball)`,
    })

  const ticks = []
  for (let f = 0; f <= s.fMax + 0.001; f += 2) ticks.push({ f, x: x(f) })

  return {
    W, H, pad, iw, ih, maxM, markers, ticks,
    onsetPath: pathOf(s.onsetPts),
    oddPath: pathOf(s.oddPts),
    axisY: y(0),
    axisX: pad.l,
    top: pad.t,
    right: pad.l + iw,
    bottom: pad.t + ih,
    baseProm: s.baseMag / s.onsetMedian,
    oddProm: s.wOddMag / s.oddMedian,
  }
})

const deltaChart = computed(() => {
  const st = stats.value
  if (!st) return null
  const W = 660
  const H = 110
  const pad = { l: 52, r: 16, t: 10, b: 20 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const ds = st.deltas
  const lim = Math.max(1, ...ds.map((v) => Math.abs(v))) * 1.1
  const x = (i) => pad.l + (ds.length < 2 ? iw / 2 : (i / (ds.length - 1)) * iw)
  const y = (v) => pad.t + ih / 2 - (v / lim) * (ih / 2)
  const d = ds.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return { W, H, pad, iw, ih, lim, d, zeroY: y(0), x, y, n: ds.length }
})

// ---------- export ----------
const f = (x, d = 3) => Number(x).toFixed(d)

function csvField(v) {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function download(name, text, mime) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function exportCsv() {
  const l = log.value
  const rows = [[
    'index', 'position', 'stimulusId', 'isOddball',
    'targetMs', 'onsetMs', 'deltaMs', 'ioiMs',
  ]]
  for (let i = 0; i < l.length; i++) {
    const e = l[i]
    const ioi = i > 0 ? l[i].onsetMs - l[i - 1].onsetMs : ''
    rows.push([
      e.index, e.position, e.stimulusId, e.isOddball ? 1 : 0,
      f(e.targetMs), f(e.onsetMs), f(e.deltaMs), ioi === '' ? '' : f(ioi),
    ])
  }
  download('fpvs-onsets.csv', rows.map((r) => r.map(csvField).join(',')).join('\n'), 'text/csv')
}

function exportJson() {
  const st = stats.value
  const payload = {
    exportedAt: new Date().toISOString(),
    config: {
      baseRateHz: store.baseRateHz,
      oddballEvery: store.oddballEvery,
      sequenceLengthS: store.sequenceLengthS,
      targetPeriodMs: targetPeriodMs.value,
      oddballRateHz: oddballHz.value,
      totalStimuli: store.totalStimuli,
    },
    summary: st && {
      stimuliLogged: st.stimCount,
      oddballsLogged: st.oddballCount,
      complete: complete.value,
      ioiMeanMs: st.mean,
      ioiSdMs: st.sd,
      ioiMinMs: st.minIoi,
      ioiMaxMs: st.maxIoi,
      worstIoiDeviationMs: st.worstIoi,
      maxAbsScheduleDeviationMs: st.maxAbsDelta,
      realizedRateHz: st.realizedHz,
      rateErrorHz: st.rateErrHz,
      rateErrorPct: st.rateErrPct,
    },
    spectrum: spectrum.value && {
      fMax: spectrum.value.fMax,
      onsetMedianMagnitude: spectrum.value.onsetMedian,
      oddMedianMagnitude: spectrum.value.oddMedian,
      magAtBaseHz_onset: spectrum.value.baseMag,
      magAtBaseHz_weighted: spectrum.value.wBaseMag,
      magAtOddballHz_weighted: spectrum.value.wOddMag,
      baseProminence: spectrum.value.baseMag / spectrum.value.onsetMedian,
      oddballProminence: spectrum.value.wOddMag / spectrum.value.oddMedian,
    },
    onsets: log.value,
  }
  download('fpvs-run.json', JSON.stringify(payload, null, 2), 'application/json')
}
</script>

<template>
  <main class="results">
    <header class="bar">
      <h1>FPVS — results</h1>
      <div class="actions">
        <button type="button" @click="store.go('setup')">Back to setup</button>
        <button type="button" :disabled="!hasData" @click="exportCsv">Export CSV</button>
        <button type="button" :disabled="!hasData" @click="exportJson">Export JSON</button>
      </div>
    </header>

    <p v-if="!hasData" class="empty">
      No run logged yet. <button type="button" @click="store.go('setup')">Configure a run</button>
    </p>

    <template v-else>
      <p v-if="!complete" class="warn">
        Partial run — {{ stats.stimCount }} of {{ store.totalStimuli }} stimuli logged.
        Statistics below describe only the captured portion.
      </p>

      <section>
        <h2>Inter-onset intervals</h2>
        <p class="target">
          Target: <strong>{{ f(stats.target, 2) }} ms</strong>
          ({{ f(baseHz, 3) }} Hz) across <strong>{{ stats.stimCount }}</strong> stimuli.
        </p>
        <table>
          <tbody>
            <tr>
              <th>Mean IOI</th>
              <td>{{ f(stats.mean, 3) }} ms</td>
              <td class="note">→ realized {{ f(stats.realizedHz, 4) }} Hz
                ({{ stats.rateErrPct >= 0 ? '+' : '' }}{{ f(stats.rateErrPct, 3) }} %,
                {{ stats.rateErrHz >= 0 ? '+' : '' }}{{ f(stats.rateErrHz, 4) }} Hz)</td>
            </tr>
            <tr>
              <th>SD of IOI</th>
              <td>{{ f(stats.sd, 3) }} ms</td>
              <td class="note">jitter about the mean</td>
            </tr>
            <tr>
              <th>Min / max IOI</th>
              <td>{{ f(stats.minIoi, 2) }} / {{ f(stats.maxIoi, 2) }} ms</td>
              <td class="note">spread {{ f(stats.maxIoi - stats.minIoi, 2) }} ms</td>
            </tr>
            <tr>
              <th>Worst IOI vs target</th>
              <td>{{ f(stats.worstIoi, 3) }} ms</td>
              <td class="note">max |IOI − target|</td>
            </tr>
            <tr>
              <th>Worst schedule offset</th>
              <td>{{ f(stats.maxAbsDelta, 3) }} ms</td>
              <td class="note">max |onset − ideal schedule|, absolute drift over the run</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="chart">
        <h2>Frequency-domain check</h2>
        <p class="note">
          DFT of the onset train. A clean peak at the base rate means the stream
          was periodic; a secondary peak at the oddball rate means the oddballs
          landed on a stable sub-harmonic. Prominence is the peak magnitude over
          the median of the spectrum (≈ noise floor).
        </p>
        <p class="target">
          Base peak (onset spectrum):
          <strong>{{ f(chart.baseProm, 1) }}×</strong> median
          &nbsp;·&nbsp;
          Oddball peak (weighted spectrum):
          <strong>{{ f(chart.oddProm, 1) }}×</strong> median
        </p>

        <svg :viewBox="`0 0 ${chart.W} ${chart.H}`" class="plot" role="img"
             aria-label="Onset-train spectrum">
          <line :x1="chart.axisX" :y1="chart.axisY" :x2="chart.right" :y2="chart.axisY" class="axis" />
          <line :x1="chart.axisX" :y1="chart.top" :x2="chart.axisX" :y2="chart.axisY" class="axis" />

          <g v-for="t in chart.ticks" :key="t.f">
            <line :x1="t.x" :y1="chart.axisY" :x2="t.x" :y2="chart.axisY + 4" class="tick" />
            <text :x="t.x" :y="chart.axisY + 16" class="tlabel">{{ t.f }}</text>
          </g>
          <text :x="chart.right" :y="chart.axisY + 16" class="tlabel" text-anchor="end">Hz</text>

          <path :d="chart.onsetPath" class="trace" />
          <path :d="chart.oddPath" class="trace odd" />

          <g v-for="m in chart.markers" :key="m.label">
            <line :x1="m.x" :y1="chart.top" :x2="m.x" :y2="chart.axisY" class="marker" />
            <circle :cx="m.x" :cy="m.y" r="3.5" class="dot" />
            <text :x="m.x" :y="chart.top + 12" class="mlabel">{{ m.label }}</text>
          </g>
        </svg>
      </section>

      <section v-if="deltaChart">
        <h2>Onset deviation over the run</h2>
        <p class="note">
          Each onset's offset from the ideal schedule
          (<code>onsetMs − targetMs</code>). A flat band near zero means no drift;
          band width is the jitter; visible slope would mean a clock mismatch.
        </p>
        <svg :viewBox="`0 0 ${deltaChart.W} ${deltaChart.H}`" class="plot small" role="img"
             aria-label="Onset deviation over time">
          <line :x1="deltaChart.pad.l" :y1="deltaChart.zeroY"
                :x2="deltaChart.pad.l + deltaChart.iw" :y2="deltaChart.zeroY" class="axis" />
          <path :d="deltaChart.d" class="trace alt" />
          <text :x="deltaChart.pad.l - 6" :y="deltaChart.zeroY + 3"
                class="tlabel" text-anchor="end">0</text>
          <text :x="deltaChart.pad.l - 6" :y="deltaChart.pad.t + 9"
                class="tlabel" text-anchor="end">+{{ f(deltaChart.lim, 1) }}</text>
          <text :x="deltaChart.pad.l - 6" :y="deltaChart.pad.t + deltaChart.ih"
                class="tlabel" text-anchor="end">−{{ f(deltaChart.lim, 1) }}</text>
          <text :x="deltaChart.pad.l + deltaChart.iw" :y="deltaChart.pad.t + deltaChart.ih + 14"
                class="tlabel" text-anchor="end">ms</text>
        </svg>
      </section>

      <section>
        <h2>Raw log</h2>
        <p class="note">
          {{ stats.stimCount }} entries, {{ stats.oddballCount }} oddballs.
          Use the export buttons above for the full data.
        </p>
        <table class="log">
          <thead>
            <tr>
              <th>#</th><th>stimulus</th><th>odd</th>
              <th>target (ms)</th><th>onset (ms)</th><th>Δ (ms)</th><th>IOI (ms)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in log.slice(0, 40)" :key="e.index" :class="{ odd: e.isOddball }">
              <td>{{ e.position }}</td>
              <td>{{ e.stimulusId }}</td>
              <td>{{ e.isOddball ? '•' : '' }}</td>
              <td>{{ f(e.targetMs, 2) }}</td>
              <td>{{ f(e.onsetMs, 2) }}</td>
              <td>{{ f(e.deltaMs, 2) }}</td>
              <td>{{ i > 0 ? f(e.onsetMs - log[i - 1].onsetMs, 2) : '' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="log.length > 40" class="note">…{{ log.length - 40 }} more rows in the export.</p>
      </section>
    </template>
  </main>
</template>
