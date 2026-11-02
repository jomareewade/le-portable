// ===== App: draws the screens from state and runs the activation flow =====

import { createStore, selectors, clearSession } from './store.js';
import * as api from './api.js';
import { validateImei, validateOrderNumber, parseActivationCode, formatImei, formatMobile, maskEmail } from './validation.js';
import { SMDP_HOST, SAMPLE_PHONES, SAMPLE_ORDERS, lpaFor } from './data.js';

const store = createStore();
const { dispatch, getState } = store;
const phoneEl = document.getElementById('app');
const demoEl = document.getElementById('demo');

// ---------- Small helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ICON = {
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  tick: (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  cross: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  sim: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><rect x="9.5" y="12" width="5" height="6" rx="1"/></svg>',
  warn: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/></svg>',
  flask: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/></svg>',
  close: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

const LOGO = `
  <div class="logo" role="img" aria-label="Aurora Mobile">
    <svg width="26" height="26" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M12 52V32a20 20 0 0 1 40 0v20" stroke="var(--brand)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="32" cy="43" r="5.5" fill="var(--success)"/>
    </svg>
    <span>aurora <span class="brand">mobile</span></span>
  </div>`;

// ---------- Mock QR codes: each code string draws its own pattern ----------
const qrCache = new Map();
function qrHtml(seedText) {
  if (qrCache.has(seedText)) return qrCache.get(seedText);
  let seed = 7;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  const n = 21;
  const finder = (x, y) => {
    const ox = x > 12 ? x - 14 : x, oy = y > 12 ? y - 14 : y;
    if (ox < 0 || oy < 0 || ox > 6 || oy > 6) return false;
    return ox === 0 || ox === 6 || oy === 0 || oy === 6 || (ox >= 2 && ox <= 4 && oy >= 2 && oy <= 4);
  };
  let html = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
      let dark;
      if (inFinder) dark = finder(x, y);
      else if (y === 6) dark = x % 2 === 0;
      else if (x === 6) dark = y % 2 === 0;
      else { seed = (seed * 48271) % 2147483647; dark = seed % 100 < 46; }
      if (dark) html += `<i style="grid-column:${x + 1};grid-row:${y + 1}"></i>`;
    }
  }
  qrCache.set(seedText, html);
  return html;
}

// What the simulated camera is pointed at
const SCAN_TARGETS = {
  own:     { label: (s) => `Your QR code (${s.order.data?.orderNo ?? 'your order'})` },
  other:   { label: () => "Someone else's QR code" },
  used:    { label: () => "A code that's already been used" },
  foreign: { label: () => 'A code from another provider' },
  blurry:  { label: () => 'A blurry, unreadable code' },
};

function codeForTarget(target, s) {
  const mine = s.order.data?.orderNo;
  switch (target) {
    case 'own':     return { host: SMDP_HOST, matchingId: api.currentCodeFor(mine) };
    case 'other':   return { host: SMDP_HOST, matchingId: api.currentCodeFor(mine === 'AUR-517204' ? 'AUR-482913' : 'AUR-517204') };
    case 'used':    return { host: SMDP_HOST, matchingId: api.currentCodeFor('AUR-390655') };
    case 'foreign': return { host: 'smdp.coastline-telecom.example', matchingId: 'C7-HQ2M-8WZT-4KDN' };
    default:        return null;
  }
}

// =====================================================================
//  Rendering
// =====================================================================

const STEPS = ['Your phone', 'Your order', 'Scan', 'Done'];
const STEP_OF = { phone: 1, order: 2, scan: 3, error: 3, success: 4 };

function render(state, prev) {
  // Remember which field had focus so typing isn't interrupted by a redraw
  const active = document.activeElement;
  const focusId = active && active.id;
  const sel = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

  const entering = !prev || prev.screen !== state.screen;
  const step = STEP_OF[state.screen];
  phoneEl.dataset.screen = state.screen;

  const canGoBack = (state.screen === 'order' || state.screen === 'scan') && state.scan.phase !== 'activating';
  const backLabel = state.screen === 'order' ? 'Back to your phone' : 'Cancel scan and go back';

  phoneEl.innerHTML = `
    <header class="topbar">
      ${canGoBack ? `<button class="icon-btn" data-action="back" aria-label="${backLabel}">${ICON.back}</button>` : '<div class="spacer"></div>'}
      ${LOGO}
      <div class="spacer"></div>
    </header>
    ${progressBar(step, prev ? STEP_OF[prev.screen] : step)}
    ${{ phone: phoneScreen, order: orderScreen, scan: scanScreen, error: errorScreen, success: successScreen }[state.screen](state, entering)}
  `;

  demoEl.innerHTML = demoPanel(state);

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && 'setSelectionRange' in el) { try { el.setSelectionRange(...sel); } catch { /* not a text field */ } }
    }
  }
}

// The bar is redrawn with each render, so when the step changes it starts at the
// old fill and animates to the new one.
function progressBar(step, fromStep) {
  const total = STEPS.length;
  const style = `--from: ${fromStep / total}; --to: ${step / total}`;
  return `
    <div class="progress">
      <div class="progress-label" id="progress-label">Step ${step} of ${total} · ${STEPS[step - 1]}</div>
      <div class="progress-track" role="progressbar" aria-labelledby="progress-label"
        aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${step}">
        <div class="progress-fill ${fromStep !== step ? 'grow' : ''}" style="${style}"></div>
      </div>
    </div>`;
}

// ---------- Step 1 ----------
function phoneScreen(s, entering) {
  const count = selectors.phoneCount(s);
  const ready = selectors.phoneReady(s);

  return `
  <section class="screen ${entering ? 'enter-up' : ''}">
    <div class="content">
      <div class="hero-icon">${ICON.sim}</div>
      <h1>Check your phone</h1>
      <p class="lead">First, let's make sure your phone is ready for an Aurora Mobile eSIM.</p>

      <div class="card checklist">
        ${s.imei.status === 'ok'
          ? doneItem('Phone supports eSIM', `${esc(s.imei.device.model)} · IMEI ${formatImei(s.imei.device.imei)}`, 'imei-edit')
          : formItem({
              key: 'imei', title: 'Check your phone supports eSIM',
              help: 'Dial *#06# to see your 15-digit IMEI.',
              label: 'IMEI', placeholder: '15 digits', inputmode: 'numeric', field: s.imei, button: 'Check',
            })}

        <div class="item">
          ${statusMark(s.online ? 'ok' : 'error')}
          <div class="item-text">
            <span class="item-title">${s.online ? 'Connected to the internet' : "You're offline"}</span>
            <span class="item-help">${s.online ? 'Wi-Fi is best for downloading your eSIM.' : 'Connect to Wi-Fi to download your eSIM.'}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="ready-label" aria-live="polite">${ready ? 'Your phone is ready' : `${count} of 2 ready`}</div>
      <button class="primary-btn" data-action="next" ${ready ? '' : 'disabled'}>Continue</button>
    </div>
  </section>`;
}

// ---------- Step 2 ----------
function orderScreen(s, entering) {
  const count = selectors.orderCount(s);
  const ready = selectors.allReady(s);
  // The phone screen's items can change after leaving it (going offline), so say why scanning is blocked
  const label = ready ? 'All set. Ready to scan'
    : selectors.orderReady(s) && !s.online ? "You're offline. Connect to Wi-Fi to continue"
    : `${count} of 2 ready`;

  return `
  <section class="screen ${entering ? 'enter-up' : ''}">
    <div class="content">
      <div class="hero-icon">${ICON.sim}</div>
      <h1>Find your order</h1>
      <p class="lead">Now let's match your phone to your Aurora Mobile order.</p>

      <div class="card checklist">
        ${s.order.status === 'ok'
          ? doneItem(`Order ${esc(s.order.data.orderNo)}`, `${esc(s.order.data.name)} · ${esc(s.order.data.plan)} · ${formatMobile(s.order.data.number)}`, 'order-edit')
          : formItem({
              key: 'order', title: 'Find your order',
              help: "It's in your confirmation email, like AUR-123456.",
              label: 'Order number', placeholder: 'AUR-123456', inputmode: 'text', field: s.order, button: 'Find',
            })}

        <button class="item item-btn" role="checkbox" aria-checked="${s.keepSim}" data-action="keepSim">
          ${statusMark(s.keepSim ? 'ok' : 'idle')}
          <span class="item-text">
            <span class="item-title">I'll keep my current SIM in place</span>
            <span class="item-help">Don't remove it until your eSIM is active.</span>
          </span>
        </button>
      </div>
    </div>

    <div class="footer">
      <div class="ready-label" aria-live="polite">${label}</div>
      <button class="primary-btn" data-action="start-scan" ${ready ? '' : 'disabled'}>Scan QR code</button>
    </div>
  </section>`;
}

function statusMark(kind) {
  const inner = kind === 'ok' ? ICON.tick() : kind === 'error' ? ICON.cross : kind === 'busy' ? '' : '';
  return `<span class="mark mark-${kind}">${inner}</span>`;
}

function doneItem(title, sub, editAction) {
  return `
    <div class="item">
      ${statusMark('ok')}
      <div class="item-text">
        <span class="item-title">${title}</span>
        <span class="item-help">${sub}</span>
      </div>
      <button class="link-btn small" data-action="${editAction}">Change</button>
    </div>`;
}

function formItem({ key, title, help, label, placeholder, inputmode, field, button }) {
  const busy = field.status === 'checking';
  const err = field.status === 'error' ? field.error : null;
  return `
    <form class="item item-form" data-form="${key}" novalidate>
      ${statusMark(busy ? 'busy' : err ? 'error' : 'idle')}
      <div class="item-text">
        <span class="item-title">${title}</span>
        <span class="item-help">${help}</span>
        <div class="field-row">
          <label class="sr-only" for="${key}-input">${label}</label>
          <input id="${key}-input" class="input ${err ? 'invalid' : ''}" type="text" inputmode="${inputmode}"
            autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${placeholder}"
            value="${esc(field.input)}" ${busy ? 'disabled' : ''}
            ${err ? `aria-invalid="true" aria-describedby="${key}-error"` : ''}>
          <button class="small-btn" type="submit" ${busy ? 'disabled' : ''}>${busy ? '<span class="spinner"></span><span class="sr-only">Checking</span>' : button}</button>
        </div>
        ${err ? `<span class="field-error" id="${key}-error" role="alert">${esc(err)}</span>` : ''}
      </div>
    </form>`;
}

// ---------- Step 3 ----------
function scanScreen(s, entering) {
  const { phase, target, hint, activationStep } = s.scan;
  const code = phase === 'aim' && target === 'blurry' ? { matchingId: 'blur' } : (lastCode || codeForTarget(target, s) || { matchingId: 'x' });
  const status = { aim: hint ? "Couldn't read that code" : 'Looking for a QR code…', locked: 'Code detected', activating: 'Activating your eSIM' }[phase];
  const sub = {
    aim: hint || 'Hold your phone steady so the code fits inside the frame.',
    locked: 'Got it. Hold still for a moment.',
    activating: 'Keep this screen open until setup finishes.',
  }[phase];

  const steps = ['Checking your code', 'Downloading your eSIM', 'Activating your line'];

  return `
  <section class="screen ${entering ? 'enter-fade' : ''}">
    <div class="camera" data-phase="${phase}">
      <div class="scan-heading">
        <h2>Scan your QR code</h2>
        <p>${esc(sub)}</p>
      </div>

      <div class="viewfinder">
        <span class="bracket tl"></span><span class="bracket tr"></span>
        <span class="bracket bl"></span><span class="bracket br"></span>
        <div class="qr ${target === 'blurry' ? 'blurry' : ''}"><div class="qr-grid">${qrHtml(code.matchingId)}</div></div>
        <div class="scan-line"></div>
        <div class="badge" aria-hidden="true">${ICON.tick(22)}</div>
      </div>

      <div class="status" aria-live="polite">${status}</div>

      ${phase === 'aim' && !s.scan.manualOpen ? `
        <div class="scan-controls">
          ${s.notice ? `<div class="notice" role="status">${esc(s.notice)}</div>` : ''}
          <label class="sim-label" for="scan-target">Simulated camera is pointing at</label>
          <select id="scan-target" class="select">
            ${Object.entries(SCAN_TARGETS).map(([k, t]) => `<option value="${k}" ${k === target ? 'selected' : ''}>${esc(t.label(s))}</option>`).join('')}
          </select>
          <button class="ghost-btn" data-action="manual-open">Enter code manually</button>
        </div>` : ''}

      ${s.scan.manualOpen ? `
        <form class="sheet sheet-manual" data-form="manual" novalidate>
          <div class="sheet-title">Enter activation code</div>
          <p class="sheet-help">It's under the QR code in your email and starts with LPA:1$</p>
          <label class="sr-only" for="manual-input">Activation code</label>
          <textarea id="manual-input" class="input textarea ${s.scan.manualError ? 'invalid' : ''}" rows="2" spellcheck="false"
            autocomplete="off" placeholder="LPA:1$smdp.aurora-mobile.example$XX-XXXX-XXXX-XXXX"
            ${s.scan.manualError ? 'aria-invalid="true" aria-describedby="manual-error"' : ''}>${esc(s.scan.manualInput)}</textarea>
          ${s.scan.manualError ? `<span class="field-error" id="manual-error" role="alert">${esc(s.scan.manualError)}</span>` : ''}
          <div class="sheet-actions">
            <button type="button" class="secondary-btn" data-action="manual-close">Cancel</button>
            <button type="submit" class="primary-btn">Continue</button>
          </div>
        </form>` : ''}

      ${phase === 'activating' ? `
        <div class="sheet">
          <div class="sheet-title">Setting up your eSIM</div>
          <div class="track"><div class="bar" style="width:${[20, 52, 84, 100][activationStep]}%"></div></div>
          <ul class="steps">
            ${steps.map((label, i) => `<li class="${activationStep > i ? 'done' : activationStep === i ? 'active' : ''}"><span class="dot"></span>${label}</li>`).join('')}
          </ul>
        </div>` : ''}
    </div>
  </section>`;
}

// ---------- Error ----------
const ERROR_COPY = {
  CODE_EXPIRED:        { title: 'This QR code has expired', primary: ['reissue', 'Send me a new code'] },
  CODE_USED:           { title: 'This code has already been used', primary: ['scan-again', 'Scan a different code'] },
  CODE_WRONG_ORDER:    { title: "That's not your code", primary: ['scan-again', 'Scan my code'] },
  CODE_WRONG_PROVIDER: { title: 'Not an Aurora Mobile code', primary: ['scan-again', 'Scan a different code'] },
  CODE_UNKNOWN:        { title: "We don't recognise this code", primary: ['scan-again', 'Scan a different code'] },
  NETWORK:             { title: 'Connection lost', primary: ['retry', 'Try again'] },
};

function errorScreen(s, entering) {
  const e = s.error;
  const copy = ERROR_COPY[e.code] || { title: 'Something went wrong', primary: ['scan-again', 'Try again'] };
  return `
  <section class="screen ${entering ? 'enter-up' : ''}">
    <div class="content center">
      <div class="error-mark">${ICON.warn}</div>
      <h1>${copy.title}</h1>
      <p class="lead">${esc(e.message)}</p>
      <p class="error-code">Error code: ${esc(e.code)}</p>
    </div>
    <div class="footer">
      <button class="primary-btn" data-action="${copy.primary[0]}">${copy.primary[1]}</button>
      <button class="secondary-btn" data-action="back">Back to your order</button>
    </div>
  </section>`;
}

// ---------- Step 4 ----------
function successScreen(s) {
  const r = s.result;
  const when = new Date(r.activatedAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  return `
  <section class="screen">
    <div class="content center">
      <div class="success-mark">
        <div class="halo"></div>
        <svg width="76" height="76" viewBox="0 0 88 88" fill="none" aria-hidden="true">
          <circle class="ring" cx="44" cy="44" r="40" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
          <path class="tick" d="M27 45l12 12 22-26" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h1 class="fade d1">You're all set, ${esc(r.firstName)}</h1>
      <p class="lead fade d2">Your Aurora Mobile eSIM is active and ready to use.</p>

      <div class="card details fade d3">
        <div class="row"><span>Status</span><span class="pill"><span class="pill-dot"></span>Active</span></div>
        <div class="row"><span>Number</span><strong>${formatMobile(r.number)}</strong></div>
        <div class="row"><span>Plan</span><strong>${esc(r.plan)}</strong></div>
        <div class="row"><span>Phone</span><strong>${esc(r.model)}</strong></div>
        <div class="row"><span>SIM number</span><strong>•••• ${esc(r.iccid.slice(-4))}</strong></div>
        <div class="row"><span>Activated</span><strong>Today, ${when}</strong></div>
      </div>

      <div class="next fade d4">
        <div class="eyebrow">What's next</div>
        <div class="next-item"><span class="num">1</span><span>Choose which line to use for mobile data in your phone's settings.</span></div>
        <div class="next-item"><span class="num">2</span><span>Keep your original SIM until you've opened a web page on the new line.</span></div>
      </div>
    </div>
    <div class="footer">
      <button class="primary-btn" data-action="done">Done</button>
    </div>
  </section>`;
}

// ---------- Test-data panel ----------
function demoPanel(s) {
  if (!s.demo.open) {
    return `<button class="demo-fab" data-action="demo-open" aria-label="Open test data">${ICON.flask}<span>Test data</span></button>`;
  }
  const net = [['normal', 'Normal'], ['slow', 'Slow'], ['flaky', 'Drops once'], ['offline', 'Offline']];
  return `
  <div class="demo-backdrop" data-action="demo-close"></div>
  <aside class="demo-sheet" role="dialog" aria-modal="true" aria-labelledby="demo-title">
    <div class="demo-head">
      <h2 id="demo-title">Test data</h2>
      <button class="icon-btn" data-action="demo-close" aria-label="Close test data">${ICON.close}</button>
    </div>
    <p class="demo-intro">Everything here is made up, and nothing leaves your browser. Tap Use to fill the form.</p>

    <h3>Phones (IMEI)</h3>
    ${SAMPLE_PHONES.map((p) => `
      <div class="demo-row">
        <div><strong>${esc(p.label)}</strong><span class="demo-note">${esc(p.note)}</span><code>${formatImei(p.imei)}</code></div>
        <button class="small-btn" data-action="use-imei" data-value="${p.imei}">Use</button>
      </div>`).join('')}

    <h3>Orders</h3>
    ${SAMPLE_ORDERS.map((o) => `
      <div class="demo-row">
        <div><strong>${esc(o.order)} · ${esc(o.label)}</strong><span class="demo-note">${esc(o.note)}</span></div>
        <button class="small-btn" data-action="use-order" data-value="${o.order}">Use</button>
      </div>`).join('')}

    <h3>Activation codes</h3>
    <p class="demo-intro">For testing "Enter code manually". Select and copy.</p>
    ${SAMPLE_ORDERS.map((o) => `<code class="demo-code">${esc(lpaFor(api.currentCodeFor(o.order)))}</code>`).join('')}

    <h3>Network</h3>
    <div class="segmented" role="radiogroup" aria-label="Network conditions">
      ${net.map(([v, l]) => `<button role="radio" aria-checked="${s.demo.network === v}" data-action="network" data-value="${v}">${l}</button>`).join('')}
    </div>

    <button class="secondary-btn reset" data-action="reset-demo">Reset all demo data</button>
  </aside>`;
}

// =====================================================================
//  Effects: the async work (calling the mock API, timers)
// =====================================================================

let runId = 0;            // bumps whenever a scan is cancelled, so stale results are ignored
let timers = [];
let lastCode = null;      // the code being activated, so we can retry

function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
function stopScan() { runId++; timers.forEach(clearTimeout); timers = []; }
function focusField(id) { requestAnimationFrame(() => document.getElementById(id)?.focus()); }

async function submitImei() {
  const { value, error } = validateImei(getState().imei.input);
  if (error) { dispatch({ type: 'imei/invalid', error }); focusField('imei-input'); return; }
  dispatch({ type: 'imei/checking', value });
  try {
    const device = await api.checkDevice(value);
    dispatch({ type: 'imei/ok', device });
  } catch (err) {
    dispatch({ type: 'imei/invalid', error: err.message });
    focusField('imei-input');
  }
}

async function submitOrder() {
  const { value, error } = validateOrderNumber(getState().order.input);
  if (error) { dispatch({ type: 'order/invalid', error }); focusField('order-input'); return; }
  dispatch({ type: 'order/checking', value });
  try {
    const data = await api.findOrder(value);
    dispatch({ type: 'order/ok', data });
  } catch (err) {
    dispatch({ type: 'order/invalid', error: err.message });
    focusField('order-input');
  }
}

// Step 3: "look" through the camera until a readable code appears
function startScan(opts = {}) {
  stopScan();
  lastCode = null;
  dispatch({ type: 'scan/start', ...opts });
  scheduleLook(1800);
}

function scheduleLook(ms) {
  const id = runId;
  later(ms, () => {
    if (id !== runId) return;
    const s = getState();
    if (s.screen !== 'scan' || s.scan.phase !== 'aim' || s.scan.manualOpen) return;
    const code = codeForTarget(s.scan.target, s);
    if (!code) {
      dispatch({ type: 'scan/unreadable', hint: 'Move closer and make sure the code is well lit.' });
      scheduleLook(2400);
      return;
    }
    codeFound(code);
  });
}

function codeFound(code) {
  lastCode = code;
  dispatch({ type: 'scan/locked' });
  const id = runId;
  later(1100, () => { if (id === runId) runActivation(0); });
}

async function runActivation(fromStep) {
  const id = runId;
  const s = getState();
  const orderNo = s.order.data.orderNo;
  const calls = [
    () => api.verifyCode({ ...lastCode, orderNo }),
    () => api.downloadProfile(),
    () => api.activateLine({ orderNo, imei: s.imei.device.imei }),
  ];
  let activatedAt;
  for (let step = fromStep; step < calls.length; step++) {
    dispatch({ type: 'scan/activating', step });
    try {
      const res = await calls[step]();
      if (id !== runId) return;
      if (res.activatedAt) activatedAt = res.activatedAt;
    } catch (err) {
      if (id !== runId) return;
      dispatch({ type: 'activation/failed', error: { code: err.code || 'UNKNOWN', message: err.message, fromStep: step } });
      return;
    }
  }
  dispatch({ type: 'scan/activating', step: 3 });
  await wait(700);
  if (id !== runId) return;
  const o = getState().order.data;
  dispatch({
    type: 'activation/succeeded',
    result: { firstName: o.name.split(' ')[0], number: o.number, plan: o.plan, iccid: o.iccid, model: s.imei.device.model, activatedAt },
  });
}

function submitManual() {
  const parsed = parseActivationCode(getState().scan.manualInput);
  if (parsed.error) { dispatch({ type: 'scan/manualInvalid', error: parsed.error }); focusField('manual-input'); return; }
  stopScan();
  runId++;
  codeFound({ host: parsed.host, matchingId: parsed.matchingId });
}

async function reissue(btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner light"></span> Sending…';
  try {
    const { email } = await api.reissueCode(getState().order.data.orderNo);
    startScan({ target: 'own', notice: `New code sent to ${maskEmail(email)}` });
  } catch (err) {
    dispatch({ type: 'activation/failed', error: { code: err.code, message: err.message, fromStep: 0 } });
  }
}

function retry() {
  const from = getState().error.fromStep;
  const code = lastCode;
  stopScan();
  dispatch({ type: 'scan/start' });
  lastCode = code;
  dispatch({ type: 'scan/locked' });
  runActivation(from);
}

function useSample(kind, value) {
  stopScan();
  const s = getState();
  // Open the screen that holds this field
  const screen = kind === 'imei' ? 'phone' : 'order';
  if (s.screen !== screen) dispatch({ type: 'flow/goto', screen });
  dispatch({ type: 'demo/open', value: false });
  if (s[kind].status === 'ok') dispatch({ type: `${kind}/edit` });
  dispatch({ type: `${kind}/input`, value });
  kind === 'imei' ? submitImei() : submitOrder();
}

// =====================================================================
//  Events (one listener per event type, using data-action attributes)
// =====================================================================

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const v = el.dataset.value;
  switch (el.dataset.action) {
    case 'imei-edit':    dispatch({ type: 'imei/edit' }); focusField('imei-input'); break;
    case 'order-edit':   dispatch({ type: 'order/edit' }); focusField('order-input'); break;
    case 'keepSim':      dispatch({ type: 'keepSim/toggle' }); break;
    case 'next':         if (selectors.phoneReady(getState())) dispatch({ type: 'flow/goto', screen: 'order' }); break;
    case 'start-scan':   if (selectors.allReady(getState())) startScan({ target: 'own' }); break;
    case 'back':         stopScan(); dispatch({ type: 'flow/back' }); break;
    case 'manual-open':  stopScan(); dispatch({ type: 'scan/manualOpen', value: true }); focusField('manual-input'); break;
    case 'manual-close': dispatch({ type: 'scan/manualOpen', value: false }); scheduleLook(1800); break;
    case 'scan-again':   startScan({ target: 'own' }); break;
    case 'retry':        retry(); break;
    case 'reissue':      reissue(el); break;
    case 'done':         stopScan(); dispatch({ type: 'flow/reset' }); clearSession(); break;
    case 'demo-open':    dispatch({ type: 'demo/open', value: true }); break;
    case 'demo-close':   dispatch({ type: 'demo/open', value: false }); break;
    case 'use-imei':     useSample('imei', v); break;
    case 'use-order':    useSample('order', v); break;
    case 'network':
      api.setNetworkMode(v);
      dispatch({ type: 'demo/network', value: v });
      dispatch({ type: 'online/set', value: api.isOnline() });
      break;
    case 'reset-demo':
      stopScan(); api.resetDb(); clearSession();
      dispatch({ type: 'flow/reset' });
      break;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  ({ imei: submitImei, order: submitOrder, manual: submitManual })[form.dataset.form]();
});

document.addEventListener('input', (e) => {
  const map = { 'imei-input': 'imei/input', 'order-input': 'order/input', 'manual-input': 'scan/manualInput' };
  if (map[e.target.id]) dispatch({ type: map[e.target.id], value: e.target.value });
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'scan-target') {
    stopScan();
    dispatch({ type: 'scan/target', target: e.target.value });
    scheduleLook(1800);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && getState().demo.open) dispatch({ type: 'demo/open', value: false });
});

// Real connection changes (try turning Wi-Fi off)
window.addEventListener('online', () => dispatch({ type: 'online/set', value: api.isOnline() }));
window.addEventListener('offline', () => dispatch({ type: 'online/set', value: false }));

// ---------- Start ----------
store.subscribe(render);
api.setNetworkMode(getState().demo.network);
dispatch({ type: 'online/set', value: api.isOnline() });
