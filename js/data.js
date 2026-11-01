// ===== Synthetic data =====
// Everything here is made up. Phone numbers use the 0491 570 range that
// Australia reserves for fiction, and every IMEI and ICCID has a valid check digit.

export const SMDP_HOST = 'smdp.aurora-mobile.example';
export const CODE_LIFETIME_DAYS = 30;

// Phone models, identified by the first 8 digits of the IMEI (the "TAC")
export const MODELS_BY_TAC = {
  '35467112': { model: 'iPhone 15 Pro', esim: true },
  '35290811': { model: 'Galaxy S24', esim: true },
  '35881245': { model: 'Pixel 8', esim: true },
  '35602973': { model: 'Galaxy A10', esim: false },
};

// Individual phones with something notable about them
export const PHONES = {
  '354671124028713': { locked: false },
  '352908111193569': { locked: false },
  '358812457702146': { locked: false },
  '358812455519039': { locked: true, lockedTo: 'Coastline Telecom' },
  '356029732088470': { locked: false },
};

// Orders as they'd come from the sales system.
// issuedDaysAgo keeps the scenarios working whatever day you open the prototype.
export const ORDERS = {
  'AUR-482913': {
    name: 'Mia Chen', email: 'mia.chen@example.com',
    plan: 'Everyday 40GB', number: '0491570156', iccid: '8961010104829137127',
    matchingId: 'K2-4F7Q-9XRM-T3LB', issuedDaysAgo: 4, activatedDaysAgo: null,
  },
  'AUR-517204': {
    name: 'Liam Patel', email: 'liam.patel@example.com',
    plan: 'Travel 100GB', number: '0491570157', iccid: '8961010105172046120',
    matchingId: 'P8-2HDW-6YKN-QA51', issuedDaysAgo: 2, activatedDaysAgo: null,
  },
  'AUR-390655': {
    name: 'Sofia Rossi', email: 'sofia.rossi@example.com',
    plan: 'Starter 15GB', number: '0491570158', iccid: '8961010103906552125',
    matchingId: 'M3-7TJC-1VBE-ZR90', issuedDaysAgo: 21, activatedDaysAgo: 19,
  },
  'AUR-276118': {
    name: 'Noah Williams', email: 'noah.williams@example.com',
    plan: 'Everyday 40GB', number: '0491570159', iccid: '8961010102761183125',
    matchingId: 'R5-9LMX-4GPA-WS28', issuedDaysAgo: 41, activatedDaysAgo: null,
  },
};

// What the test-data panel shows
export const SAMPLE_PHONES = [
  { imei: '354671124028713', label: 'iPhone 15 Pro', note: 'Ready for eSIM' },
  { imei: '352908111193569', label: 'Galaxy S24', note: 'Ready for eSIM' },
  { imei: '358812455519039', label: 'Pixel 8', note: 'Locked to another carrier' },
  { imei: '356029732088470', label: 'Galaxy A10', note: "Doesn't support eSIM" },
  { imei: '354671124028710', label: 'Typo', note: 'Fails the IMEI check digit' },
];

export const SAMPLE_ORDERS = [
  { order: 'AUR-482913', label: 'Mia Chen', note: 'Ready to activate' },
  { order: 'AUR-517204', label: 'Liam Patel', note: 'Ready to activate' },
  { order: 'AUR-276118', label: 'Noah Williams', note: 'QR code has expired' },
  { order: 'AUR-390655', label: 'Sofia Rossi', note: 'Already activated' },
];

export const lpaFor = (matchingId) => `LPA:1$${SMDP_HOST}$${matchingId}`;
