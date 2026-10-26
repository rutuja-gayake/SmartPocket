/**
 * SmartPocket Date Utilities
 */

/**
 * Returns today's date in YYYY-MM-DD format based on local time.
 * @param {Date} [dateObj]
 * @returns {string}
 */
export function getTodayDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns current period in YYYY-MM format.
 * @param {Date} [dateObj]
 * @returns {string}
 */
export function getCurrentPeriod(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns the total number of days in a given month and year.
 * Correctly accounts for leap years.
 * @param {number} year
 * @param {number} month 1-12
 * @returns {number}
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Calculates remaining days in the month including today.
 * Rule: current day plus all remaining calendar days in the month.
 * Denominator must never be less than 1.
 * @param {Date|string} [currentDate]
 * @returns {number}
 */
export function getRemainingDaysInMonth(currentDate = new Date()) {
  const d = typeof currentDate === 'string' ? new Date(currentDate) : currentDate;
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate();
  const totalDays = getDaysInMonth(year, month);
  const remaining = totalDays - day + 1;
  return Math.max(1, remaining);
}

/**
 * Formats an ISO date string into Indian readable format (e.g. "26 Oct 2026").
 * @param {string} dateString
 * @returns {string}
 */
export function formatDateIndian(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  return dateObj.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
