const VISUAL_CYCLE_MS = 3000;
const state = {
  mode: 'vout', selected: null,
  vin: 5, duty: 0.10, targetVout: 5 / 0.9,
  inductance: 100e-6, capacitance: 100e-6, resistance: 20, frequency: 200_000,
  runTimer: null, closeTimer: null, phase: 'off'
};

const controls = {
  vin: { title: 'Input voltage', symbol: 'V<sub>in</sub>', description: 'Set the DC input supplied to the converter.', min: 1, max: 24, step: 0.1, toSlider: v => v, fromSlider: v => v, format: v => `${v.toFixed(1)} V` },
  duty: { title: 'Duty ratio', symbol: 'D', description: 'Fraction of each cycle for which the switch is on.', min: 1, max: 80, step: 0.1, toSlider: v => v * 100, fromSlider: v => v / 100, format: v => `${(v * 100).toFixed(1)}%` },
  vout: { title: 'Output voltage', symbol: 'V<sub>out</sub>', description: 'Choose a target output voltage. The required duty ratio is calculated.', min: 1.1, max: 120, step: 0.01, toSlider: v => v, fromSlider: v => v, format: v => `${v.toFixed(2)} V` },
  inductance: { title: 'Inductance', symbol: 'L', description: 'Changing L changes current ripple and the CCM boundary.', min: 1, max: 500, step: 1, toSlider: v => v * 1e6, fromSlider: v => v * 1e-6, format: v => `${Math.round(v * 1e6)} µH` },
  capacitance: { title: 'Output capacitance', symbol: 'C', description: 'The 100 µF default is illustrative. Changing C changes output-voltage ripple.', min: 1, max: 1000, step: 1, toSlider: v => v * 1e6, fromSlider: v => v * 1e-6, format: v => `${Math.round(v * 1e6)} µF` },
  resistance: { title: 'Load resistance', symbol: 'R', description: 'Changing R changes load current and the CCM boundary.', min: 1, max: 1000, step: 1, toSlider: v => v, fromSlider: v => v, format: v => `${Math.round(v)} Ω` }
};
const controlUnits = { vin: 'V', duty: '%', vout: 'V', inductance: 'µH', capacitance: 'µF', resistance: 'Ω' };

const $ = id => document.getElementById(id);
const svg = $('circuit');

function calculatedKey() { return state.mode === 'vout' ? 'vout' : 'duty'; }

function values() {
  const vin = state.vin;
  const duty = state.mode === 'vout' ? state.duty : 1 - vin / state.targetVout;
  const vout = state.mode === 'vout' ? vin / (1 - duty) : state.targetVout;
  const validRatio = Number.isFinite(duty) && duty >= 0.01 && duty <= 0.80;
  const iout = vout / state.resistance;
  const il = iout / (1 - duty);
  const ripple = vin * duty / (state.inductance * state.frequency);
  const imin = il - ripple / 2;
  const lcrit = state.resistance * duty * (1 - duty) ** 2 / (2 * state.frequency);
  const voltageRippleEstimate = iout * duty / (state.capacitance * state.frequency);
  const validRipple = voltageRippleEstimate <= 0.1 * vout;
  return {vin, duty, vout, iout, il, ripple, imin, lcrit, voltageRippleEstimate, validRatio, validRipple, validCCM: validRatio && imin > 1e-10};
}

function displayValue(key, v) {
  if (key === 'duty') return Number.isFinite(v.duty) ? controls.duty.format(v.duty) : '—';
  if (key === 'vout') return controls.vout.format(v.vout);
  return controls[key].format(state[key]);
}

function animationFactor() {
  return Math.round(state.frequency * VISUAL_CYCLE_MS / 1000).toLocaleString('en-US');
}

function closeControls() {
  clearTimeout(state.closeTimer);
  state.closeTimer = null;
  state.selected = null;
  $('component-popover').hidden = true;
  document.querySelectorAll('.component.control').forEach(el => el.classList.remove('selected'));
}

function scheduleClose(event) {
  if (event.pointerType !== 'mouse') return;
  clearTimeout(state.closeTimer);
  state.closeTimer = setTimeout(closeControls, 220);
}

function refreshControls() {
  if (!state.selected) return;
  const key = state.selected;
  const v = values();
  const computed = key === calculatedKey();
  const config = controls[key];
  $('popover-title').textContent = key === 'duty' ? 'MOSFET gate drive' : config.title;
  $('primary-label').innerHTML = config.symbol;
  $('primary-value').textContent = displayValue(key, v);
  $('primary-value').hidden = !computed;
  $('primary-editable').hidden = computed;
  $('primary-slider').hidden = computed;
  $('primary-readonly').hidden = !computed;
  $('frequency-row').hidden = key !== 'duty';
  if (!computed) {
    const input = $('primary-slider');
    input.min = config.min;
    input.max = config.max;
    input.step = config.step;
    input.value = config.toSlider(key === 'vout' ? state.targetVout : state[key]);
    input.setAttribute('aria-label', config.title);
    const number = $('primary-number');
    number.min = config.min;
    number.max = config.max;
    number.step = config.step;
    number.setAttribute('aria-label', `${config.title} in ${controlUnits[key]}`);
    if (document.activeElement !== number) number.value = input.value;
    $('primary-unit').textContent = controlUnits[key];
  }
  if (key === 'duty') {
    $('frequency-slider').value = state.frequency / 1000;
    if (document.activeElement !== $('frequency-number')) $('frequency-number').value = $('frequency-slider').value;
  }
}

function openControls(key) {
  clearTimeout(state.closeTimer);
  state.closeTimer = null;
  state.selected = key;
  const popover = $('component-popover');
  popover.hidden = false;
  refreshControls();
  document.querySelectorAll('.component.control').forEach(el => el.classList.toggle('selected', el.dataset.control === key));
  const group = document.querySelector(`[data-control="${key}"]`);
  const stage = $('circuit-stage');
  const rect = group.getBoundingClientRect();
  const anchor = key === 'duty' ? $('switch-contact').getBoundingClientRect() : rect;
  const stageRect = stage.getBoundingClientRect();
  const wanted = anchor.left - stageRect.left + anchor.width / 2;
  const half = popover.offsetWidth / 2;
  popover.style.left = `${Math.max(half + 12, Math.min(stage.clientWidth - half - 12, wanted))}px`;
  popover.style.top = `${Math.max(8, rect.top - stageRect.top + (rect.height - popover.offsetHeight) / 2)}px`;
}

function update() {
  const v = values();
  for (const key of ['vin', 'duty', 'vout', 'inductance', 'capacitance', 'resistance']) {
    $('label-' + key).textContent = key === 'duty' ? `D ${displayValue(key, v)}` : displayValue(key, v);
  }
  $('label-frequency').textContent = `fₛ ${Math.round(state.frequency / 1000)} kHz`;
  const ratioValid = v.validRatio;
  const valid = v.validCCM && v.validRipple;
  $('status-box').classList.toggle('invalid', !valid);
  $('status-title').textContent = !ratioValid ? 'Invalid voltage ratio' : !v.validCCM ? 'Outside CCM' : !v.validRipple ? 'Voltage ripple too large' : 'CCM valid';
  $('status-detail').textContent = !ratioValid
    ? 'For this model, the required duty ratio must be between 1% and 80%. Choose a target output above the input voltage.'
    : !v.validCCM
      ? `Increase L above ${(v.lcrit * 1e6).toFixed(1)} µH, or reduce R. Run is disabled.`
      : !v.validRipple
        ? `Increase C to keep voltage ripple within 10% of the average output. Run is disabled.`
        : `Minimum inductor current: ${v.imin.toFixed(3)} A. Current stays above zero.`;
  $('run-button').disabled = !valid;
  document.querySelectorAll('.component.control').forEach(el => {
    const key = el.dataset.control;
    el.classList.toggle('calculated', key === calculatedKey());
    el.setAttribute('aria-label', key === 'duty'
      ? `MOSFET gate drive: duty ${displayValue(key, v)}, frequency ${Math.round(state.frequency / 1000)} kilohertz`
      : `${key === calculatedKey() ? 'Calculated' : 'Set'} ${controls[key].title}: ${displayValue(key, v)}`);
  });
  refreshControls();
  if ($('run-state').dataset.ran === 'true') {
    $('run-state').dataset.ran = 'false';
    $('results').hidden = true;
    stopAnimation();
  }
  $('phase-label').textContent = `Animation ${animationFactor()}× slower · 3 s per cycle`;
}

function setMode(mode) {
  if (mode === state.mode) return;
  const current = values();
  if (mode === 'duty') state.targetVout = current.vout;
  else if (current.validRatio) state.duty = current.duty;
  state.mode = mode;
  $('mode-vout').classList.toggle('active', mode === 'vout');
  $('mode-duty').classList.toggle('active', mode === 'duty');
  $('mode-vout').setAttribute('aria-pressed', String(mode === 'vout'));
  $('mode-duty').setAttribute('aria-pressed', String(mode === 'duty'));
  closeControls();
  update();
}

function stopAnimation() {
  clearTimeout(state.runTimer);
  state.runTimer = null;
  svg.classList.remove('running', 'on', 'off');
  $('switch-contact').setAttribute('d', 'M322 259 L343 240');
  state.phase = 'off';
  $('phase-label').textContent = `Animation ${animationFactor()}× slower · 3 s per cycle`;
}

function animate() {
  stopAnimation();
  const duty = values().duty;
  let cycles = 0;
  const phase = name => {
    state.phase = name;
    svg.classList.add('running');
    svg.classList.toggle('on', name === 'on');
    svg.classList.toggle('off', name === 'off');
    $('switch-contact').setAttribute('d', name === 'on' ? 'M320 253 L320 282' : 'M322 259 L343 240');
    $('phase-label').textContent = `Switch ${name.toUpperCase()} · ${animationFactor()}× slower`;
  };
  const showOn = () => {
    phase('on');
    state.runTimer = setTimeout(showOff, VISUAL_CYCLE_MS * duty);
  };
  const showOff = () => {
    phase('off');
    cycles += 1;
    state.runTimer = setTimeout(cycles < 2 ? showOn : stopAnimation, VISUAL_CYCLE_MS * (1 - duty));
  };
  showOn();
}

function pointsFor(v, kind) {
  const samples = 1800;
  const pts = [];
  const ton = v.duty;
  const toff = 1 - ton;
  const period = 1 / state.frequency;
  const onDrop = v.iout * ton * period / state.capacitance;
  for (let i = 0; i <= samples; i++) {
    const phase = (i / samples * 3) % 1;
    if (kind === 'current') {
      const current = phase < ton ? v.imin + v.ripple * phase / ton : v.il + v.ripple / 2 - v.ripple * (phase - ton) / toff;
      pts.push(current);
    } else {
      const u = Math.max(0, phase - ton) * period;
      const offTime = toff * period;
      const deviation = phase < ton
        ? -v.iout * phase * period / state.capacitance
        : -onDrop + ((v.il + v.ripple / 2 - v.iout) * u - v.ripple * u * u / (2 * offTime)) / state.capacitance;
      pts.push(v.vout + deviation);
    }
  }
  if (kind === 'voltage') {
    const meanOffset = pts.reduce((sum, x) => sum + x, 0) / pts.length - v.vout;
    return pts.map(x => x - meanOffset);
  }
  return pts;
}

function drawPlot(id, points, kind) {
  const svgPlot = $(id);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(max - min, kind === 'voltage' ? 0.001 : 0.01);
  const lower = min - span * 0.20;
  const upper = max + span * 0.20;
  const x0 = 42, y0 = 14, w = 580, h = 162;
  const path = points.map((p, i) => `${i ? 'L' : 'M'} ${(x0 + w * i / (points.length - 1)).toFixed(2)} ${(y0 + h * (upper - p) / (upper - lower)).toFixed(2)}`).join(' ');
  const grids = [0, 1, 2, 3].map(n => `<line class="plot-grid" x1="${x0 + n*w/3}" y1="${y0}" x2="${x0 + n*w/3}" y2="${y0+h}"/>`).join('');
  const horizontals = [0, 1, 2].map(n => `<line class="plot-grid" x1="${x0}" y1="${y0+n*h/2}" x2="${x0+w}" y2="${y0+n*h/2}"/>`).join('');
  const time = cycle => `${(cycle * 1e6 / state.frequency).toFixed(1)} µs`;
  svgPlot.innerHTML = `${grids}${horizontals}<line class="plot-axis" x1="${x0}" y1="${y0+h}" x2="${x0+w}" y2="${y0+h}"/><path class="plot-line ${kind === 'voltage' ? 'voltage' : ''}" d="${path}"/><text class="plot-text" x="${x0}" y="201">0</text><text class="plot-text" x="${x0+w/3}" y="201">${time(1)}</text><text class="plot-text" x="${x0+2*w/3}" y="201">${time(2)}</text><text class="plot-text" x="${x0+w-38}" y="201">${time(3)}</text><text class="plot-text" x="0" y="22">${upper.toFixed(2)}</text><text class="plot-text" x="0" y="174">${lower.toFixed(2)}</text>`;
}

function run() {
  const v = values();
  if (!v.validCCM || !v.validRipple) return;
  $('metric-vout').textContent = `${v.vout.toFixed(2)} V`;
  $('metric-iout').textContent = `${v.iout.toFixed(3)} A`;
  $('metric-il').textContent = `${v.il.toFixed(3)} A`;
  $('metric-ripple').textContent = `${v.ripple.toFixed(3)} A`;
  const current = pointsFor(v, 'current');
  const voltage = pointsFor(v, 'voltage');
  drawPlot('current-plot', current, 'current');
  drawPlot('voltage-plot', voltage, 'voltage');
  $('current-scale').textContent = `${Math.min(...current).toFixed(3)}–${Math.max(...current).toFixed(3)} A`;
  $('voltage-scale').textContent = `${Math.min(...voltage).toFixed(3)}–${Math.max(...voltage).toFixed(3)} V`;
  $('run-state').textContent = `Three periods · ${Math.round(state.frequency / 1000)} kHz`;
  $('run-state').dataset.ran = 'true';
  $('results').hidden = false;
  closeControls();
  animate();
}

document.querySelectorAll('.component.control').forEach(el => {
  el.addEventListener('click', () => openControls(el.dataset.control));
  el.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openControls(el.dataset.control); }
  });
  el.addEventListener('pointerleave', scheduleClose);
});
$('component-popover').addEventListener('pointerenter', () => clearTimeout(state.closeTimer));
$('component-popover').addEventListener('pointerleave', scheduleClose);
$('popover-close').addEventListener('click', closeControls);
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('#component-popover, .component.control')) closeControls();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeControls(); });
window.addEventListener('resize', () => { if (state.selected) openControls(state.selected); });
$('primary-slider').addEventListener('input', event => {
  const key = state.selected;
  if (!key || key === calculatedKey()) return;
  const value = controls[key].fromSlider(Number(event.target.value));
  if (key === 'vout') state.targetVout = value;
  else state[key] = value;
  update();
});
$('frequency-slider').addEventListener('input', event => {
  state.frequency = Number(event.target.value) * 1000;
  update();
});
function bindNumber(numberId, sliderId, apply) {
  const number = $(numberId);
  const slider = $(sliderId);
  number.addEventListener('input', () => {
    const value = number.valueAsNumber;
    const valid = number.value !== '' && Number.isFinite(value) && value >= Number(slider.min) && value <= Number(slider.max);
    number.setAttribute('aria-invalid', String(!valid));
    if (!valid) return;
    slider.value = value;
    apply(Number(slider.value));
    update();
  });
  number.addEventListener('blur', () => {
    number.value = slider.value;
    number.removeAttribute('aria-invalid');
  });
}
bindNumber('primary-number', 'primary-slider', value => {
  const key = state.selected;
  if (!key || key === calculatedKey()) return;
  if (key === 'vout') state.targetVout = controls[key].fromSlider(value);
  else state[key] = controls[key].fromSlider(value);
});
bindNumber('frequency-number', 'frequency-slider', value => { state.frequency = value * 1000; });
$('mode-vout').addEventListener('click', () => setMode('vout'));
$('mode-duty').addEventListener('click', () => setMode('duty'));
$('run-button').addEventListener('click', run);
update();
