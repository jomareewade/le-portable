// ===== Mock backend =====
// Pretends to be Aurora Mobile's servers: adds realistic delays, enforces business
// rules, and can be told to misbehave from the test-data panel.
// Changes (activations, reissued codes) are saved in this browser's localStorage,
// so a code you've used stays used until you reset the demo.

import { MODELS_BY_TAC, PHONES, ORDERS, SMDP_HOST, CODE_LIFETIME_DAYS } from './data.js';

const DB_KEY = 'aurora-esim-db';
const DAY = 24 * 60 * 60 * 1000;

export class ApiError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// ---- Network simulation ----
let networkMode = 'normal';           // 'normal' | 'slow' | 'flaky' | 'offline'
let flakyTripped = false;
export function setNetworkMode(mode) { networkMode = mode; flakyTripped = false; }
export function isOnline() { return networkMode !== 'offline' && navigator.onLine !== false; }

function request(baseMs, work) {
  const ms = baseMs * (networkMode === 'slow' ? 3 : 1) * (0.8 + Math.random() * 0.4);
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!isOnline()) {
        reject(new ApiError('NETWORK', "You're offline. Check your connection and try again."));
        return;
      }
      try { resolve(work()); } catch (err) { reject(err); }
    }, ms);
  });
}

// ---- Persistence ----
function loadDb() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || {}; } catch { return {}; }
}
function saveDb(db) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* storage unavailable */ }
}
export function resetDb() {
  try { localStorage.removeItem(DB_KEY); } catch { /* ignore */ }
  flakyTripped = false;
}

// An order as it stands now: seed data plus anything that's happened in this browser
function getOrder(orderNo) {
  const seed = ORDERS[orderNo];
  if (!seed) return null;
  const changes = loadDb()[orderNo] || {};
  const now = Date.now();
  const issuedAt = changes.issuedAt ?? now - seed.issuedDaysAgo * DAY;
  const activatedAt = changes.activatedAt ??
    (seed.activatedDaysAgo != null ? now - seed.activatedDaysAgo * DAY : null);
  return {
    orderNo, ...seed,
    matchingId: changes.matchingId ?? seed.matchingId,
    issuedAt, activatedAt,
    expiresAt: issuedAt + CODE_LIFETIME_DAYS * DAY,
  };
}

function updateOrder(orderNo, changes) {
  const db = loadDb();
  db[orderNo] = { ...(db[orderNo] || {}), ...changes };
  saveDb(db);
}

const publicOrder = (o) => ({
  orderNo: o.orderNo, name: o.name, email: o.email, plan: o.plan,
  number: o.number, iccid: o.iccid, expiresAt: o.expiresAt,
});

// ---- Endpoints ----

// Is this phone able to take an eSIM?
export function checkDevice(imei) {
  return request(900, () => {
    const model = MODELS_BY_TAC[imei.slice(0, 8)];
    if (!model) {
      throw new ApiError('DEVICE_UNKNOWN', "We couldn't identify this phone. Check the IMEI, or contact us to confirm it works with eSIM.");
    }
    if (!model.esim) {
      throw new ApiError('DEVICE_NO_ESIM', `The ${model.model} doesn't support eSIM. You'll need a physical SIM card instead.`);
    }
    const phone = PHONES[imei] || { locked: false };
    if (phone.locked) {
      throw new ApiError('DEVICE_LOCKED', `This ${model.model} is locked to ${phone.lockedTo}. Ask them to unlock it, then try again.`);
    }
    return { imei, model: model.model };
  });
}

// Look up an order and confirm it's waiting for activation
export function findOrder(orderNo) {
  return request(800, () => {
    const order = getOrder(orderNo);
    if (!order) {
      throw new ApiError('ORDER_NOT_FOUND', "We couldn't find that order. Check the number in your confirmation email.");
    }
    if (order.activatedAt) {
      const when = new Date(order.activatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
      throw new ApiError('ORDER_ACTIVATED', `The eSIM for this order was already activated on ${when}.`);
    }
    return publicOrder(order);
  });
}

// Check a scanned code belongs to this order and can still be used
export function verifyCode({ host, matchingId, orderNo }) {
  return request(900, () => {
    if (host !== SMDP_HOST) {
      throw new ApiError('CODE_WRONG_PROVIDER', "This QR code is from a different mobile provider, not Aurora Mobile.");
    }
    const owner = Object.keys(ORDERS).map(getOrder).find((o) => o.matchingId === matchingId);
    if (!owner) {
      throw new ApiError('CODE_UNKNOWN', "We don't recognise this code. It may have been replaced by a newer one.");
    }
    if (owner.activatedAt) {
      throw new ApiError('CODE_USED', 'This QR code has already been used to set up an eSIM. Each code works once.');
    }
    if (owner.orderNo !== orderNo) {
      throw new ApiError('CODE_WRONG_ORDER', `This code belongs to a different order, not ${orderNo}.`);
    }
    if (Date.now() > owner.expiresAt) {
      throw new ApiError('CODE_EXPIRED', `This QR code expired. Codes last ${CODE_LIFETIME_DAYS} days, but we can send you a new one.`);
    }
    return { ok: true };
  });
}

// Download the eSIM profile to the phone
export function downloadProfile() {
  return request(1100, () => {
    if (networkMode === 'flaky' && !flakyTripped) {
      flakyTripped = true;
      throw new ApiError('NETWORK', 'The connection dropped while downloading your eSIM. Nothing was lost, so you can try again.');
    }
    return { ok: true };
  });
}

// Switch the line on
export function activateLine({ orderNo, imei }) {
  return request(1000, () => {
    const activatedAt = Date.now();
    updateOrder(orderNo, { activatedAt, imei });
    return { activatedAt };
  });
}

// Issue a fresh code for an order (e.g. after the old one expired)
export function reissueCode(orderNo) {
  return request(1000, () => {
    const order = getOrder(orderNo);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const pick = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const matchingId = `${pick(2)}-${pick(4)}-${pick(4)}-${pick(4)}`;
    updateOrder(orderNo, { matchingId, issuedAt: Date.now() });
    return { email: order.email, matchingId };
  });
}

// What the simulated camera can "see" — the current codes for each order
export function currentCodeFor(orderNo) {
  const o = getOrder(orderNo);
  return o ? o.matchingId : null;
}
