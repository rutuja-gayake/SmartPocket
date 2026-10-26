/**
 * SmartPocket Currency Utilities
 *
 * Rules:
 * - All monetary values in database and API calculations are represented in integer paise (1 INR = 100 paise).
 * - Avoid floating-point arithmetic errors by using integer math.
 * - Formats numbers according to the Indian numbering system (en-IN).
 */

/**
 * Converts a rupee amount (number or string) to integer paise.
 * Rounds to the nearest whole paise to prevent precision leaks.
 * @param {number|string} rupees
 * @returns {number} integer paise
 */
export function rupeesToPaise(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') {
    return 0;
  }
  const num = typeof rupees === 'string' ? parseFloat(rupees.replace(/,/g, '').trim()) : Number(rupees);
  if (Number.isNaN(num)) {
    throw new TypeError(`Invalid rupee value: "${rupees}"`);
  }
  return Math.round(num * 100);
}

/**
 * Converts integer paise to rupees (decimal number).
 * @param {number} paise
 * @returns {number}
 */
export function paiseToRupees(paise) {
  if (paise === null || paise === undefined) return 0;
  const p = typeof paise === 'string' ? parseInt(paise, 10) : Number(paise);
  if (Number.isNaN(p)) return 0;
  return p / 100;
}

/**
 * Formats integer paise into an Indian Rupee currency string.
 * Example: 12345678 paise -> "₹1,23,456.78"
 * @param {number} paise
 * @param {boolean} includeDecimals
 * @returns {string}
 */
export function formatINR(paise, includeDecimals = true) {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0
  }).format(rupees);
}

/**
 * Formats paise as a clean numeric string with 2 decimal places.
 * Example: 12500 paise -> "125.00"
 * @param {number} paise
 * @returns {string}
 */
export function formatRupeesPlain(paise) {
  const rupees = paiseToRupees(paise);
  return rupees.toFixed(2);
}
