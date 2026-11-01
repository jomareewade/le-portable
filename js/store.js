// ===== State management =====
// One state object, changed only by dispatching actions through the reducer
// (the same pattern as React's useReducer or Redux). Open the browser console
// to watch every action and the state it produces.

const SESSION_KEY = 'aurora-esim-session';

export const initialState = {
  screen: 'ready',                    // 'ready' | 'scan' | 'error' | 'success'

  // Step 1 – checklist
  imei:  { input: '', status: 'idle', error: null, device: null },   // status: idle | checking | ok | error
  order: { input: '', status: 'idle', error: null, data: null },
  online: true,
  keepSim: false,

  // Step 2 – scanning and activation
  scan: {
    phase: 'aim',                     // aim | locked | activating
    target: 'own',                    // what the simulated camera is pointed at
    hint: null,                       // shown when a code can't be read
    manualOpen: false,
    manualInput: '',
    manualError: null,
    activationStep: 0,                // 0 verify · 1 download · 2 activate · 3 finished
  },

  error: null,                        // { code, message, fromStep }
  result: null,                       // details shown on the success screen
  notice: null,                       // short confirmation message

  // Test-data panel
  demo: { open: false, network: 'normal' },
};

export function reducer(state, action) {
  switch (action.type) {
    // ---- Checklist ----
    case 'imei/input':
      return { ...state, imei: { ...state.imei, input: action.value, status: 'idle', error: null } };
    case 'imei/invalid':
      return { ...state, imei: { ...state.imei, status: 'error', error: action.error } };
    case 'imei/checking':
      return { ...state, imei: { ...state.imei, input: action.value, status: 'checking', error: null } };
    case 'imei/ok':
      return { ...state, imei: { ...state.imei, status: 'ok', device: action.device } };
    case 'imei/edit':
      return { ...state, imei: { ...state.imei, status: 'idle', device: null } };

    case 'order/input':
      return { ...state, order: { ...state.order, input: action.value, status: 'idle', error: null } };
    case 'order/invalid':
      return { ...state, order: { ...state.order, status: 'error', error: action.error } };
    case 'order/checking':
      return { ...state, order: { ...state.order, input: action.value, status: 'checking', error: null } };
    case 'order/ok':
      return { ...state, order: { ...state.order, status: 'ok', data: action.data } };
    case 'order/edit':
      return { ...state, order: { ...state.order, status: 'idle', data: null } };

    case 'online/set':
      return { ...state, online: action.value };
    case 'keepSim/toggle':
      return { ...state, keepSim: !state.keepSim };

    // ---- Scanning ----
    case 'scan/start':
      return {
        ...state, screen: 'scan', error: null, notice: action.notice ?? null,
        scan: { ...initialState.scan, target: action.target ?? state.scan.target },
      };
    case 'scan/target':
      return { ...state, scan: { ...state.scan, target: action.target, hint: null } };
    case 'scan/unreadable':
      return { ...state, scan: { ...state.scan, hint: action.hint } };
    case 'scan/locked':
      return { ...state, notice: null, scan: { ...state.scan, phase: 'locked', hint: null, manualOpen: false } };
    case 'scan/activating':
      return { ...state, scan: { ...state.scan, phase: 'activating', activationStep: action.step } };
    case 'scan/manualOpen':
      return { ...state, scan: { ...state.scan, manualOpen: action.value, manualError: null } };
    case 'scan/manualInput':
      return { ...state, scan: { ...state.scan, manualInput: action.value, manualError: null } };
    case 'scan/manualInvalid':
      return { ...state, scan: { ...state.scan, manualError: action.error } };

    // ---- Outcomes ----
    case 'activation/failed':
      return { ...state, screen: 'error', error: action.error };
    case 'activation/succeeded':
      return { ...state, screen: 'success', result: action.result };

    case 'notice/clear':
      return { ...state, notice: null };
    case 'flow/back':
      return { ...state, screen: 'ready', error: null, scan: initialState.scan };
    case 'flow/reset':
      return { ...initialState, online: state.online, demo: { ...state.demo, open: false } };

    // ---- Test-data panel ----
    case 'demo/open':
      return { ...state, demo: { ...state.demo, open: action.value } };
    case 'demo/network':
      return { ...state, demo: { ...state.demo, network: action.value } };

    default:
      console.warn('Unknown action', action);
      return state;
  }
}

export function createStore() {
  let state = restoreSession();
  const listeners = new Set();

  return {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch(action) {
      const prev = state;
      state = reducer(state, action);
      console.groupCollapsed(`%c${action.type}`, 'color:#1F4FFF;font-weight:bold');
      console.log('action', action);
      console.log('state', state);
      console.groupEnd();
      saveSession(state);
      listeners.forEach((fn) => fn(state, prev));
    },
  };
}

// Keep step-1 progress if the page is refreshed. A refresh mid-scan goes back
// to the checklist, the same way a real app would after being closed.
function saveSession(state) {
  const keep = {
    imei: state.imei.status === 'checking' ? { ...state.imei, status: 'idle' } : state.imei,
    order: state.order.status === 'checking' ? { ...state.order, status: 'idle' } : state.order,
    keepSim: state.keepSim,
    demo: { open: false, network: state.demo.network },
  };
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(keep)); } catch { /* ignore */ }
}

function restoreSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (saved) return { ...initialState, ...saved };
  } catch { /* ignore */ }
  return initialState;
}

export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// Derived values: worked out from state rather than stored
export const selectors = {
  readyCount: (s) => [s.imei.status === 'ok', s.order.status === 'ok', s.online, s.keepSim].filter(Boolean).length,
  allReady: (s) => selectors.readyCount(s) === 4,
};
