// ===== Validation rules =====
// Each validator returns { value, error } — error is null when the input is fine.

// Luhn check digit: used by IMEIs (and SIM card numbers) to catch typos
export function passesLuhn(digits) {
  let sum = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i++) {
    let n = Number(rev[i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

export function validateImei(raw) {
  const value = String(raw).replace(/[\s-]/g, '');
  if (!value) return { value, error: 'Enter your IMEI. Dial *#06# to see it.' };
  if (/\D/.test(value)) return { value, error: 'An IMEI only contains numbers.' };
  if (value.length !== 15) {
    return { value, error: `An IMEI is 15 digits. You've entered ${value.length}.` };
  }
  if (!passesLuhn(value)) {
    return { value, error: "That IMEI doesn't look right. Check each digit and try again." };
  }
  return { value, error: null };
}

export function validateOrderNumber(raw) {
  let value = String(raw).trim().toUpperCase().replace(/\s/g, '');
  if (/^\d{6}$/.test(value)) value = 'AUR-' + value;      // let people skip the prefix
  if (/^AUR\d{6}$/.test(value)) value = 'AUR-' + value.slice(3);
  if (!value) return { value, error: 'Enter the order number from your confirmation email.' };
  if (!/^AUR-\d{6}$/.test(value)) {
    return { value, error: 'Order numbers look like AUR-123456.' };
  }
  return { value, error: null };
}

// eSIM activation codes follow the GSMA format:  LPA:1$<server address>$<matching ID>
export function parseActivationCode(raw) {
  const value = String(raw).trim();
  if (!value) return { value, error: 'Paste or type the activation code.' };
  const m = value.match(/^LPA:1\$([A-Za-z0-9.-]+)\$([A-Za-z0-9-]+)$/);
  if (!m) {
    return { value, error: 'Activation codes start with LPA:1$ and have two parts separated by $.' };
  }
  return { value, host: m[1].toLowerCase(), matchingId: m[2].toUpperCase(), error: null };
}

// Display helpers
export const formatImei = (v) => v.replace(/^(\d{2})(\d{6})(\d{6})(\d)$/, '$1 $2 $3 $4');
export const formatMobile = (v) => v.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
export const maskEmail = (e) => e.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');
