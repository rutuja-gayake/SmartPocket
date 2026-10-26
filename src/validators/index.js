/**
 * SmartPocket Input Validators
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length >= 5 && trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}

export function validatePassword(password) {
  if (typeof password !== 'string') return false;
  // At least 8 characters, at least 1 letter, at least 1 number or special character
  if (password.length < 8 || password.length > 128) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumberOrSpecial = /[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  return hasLetter && hasNumberOrSpecial;
}

export function validateDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  if (!DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

export function validatePeriod(periodStr) {
  if (typeof periodStr !== 'string') return false;
  return PERIOD_REGEX.test(periodStr);
}

export function validateAmount(amount) {
  if (amount === undefined || amount === null) return false;
  const num = Number(amount);
  return !Number.isNaN(num) && num > 0 && num <= 100000000; // max ₹1 crore per entry
}

export function validateTransactionPayload(body) {
  const errors = [];
  if (!validateAmount(body.amount)) {
    errors.push('Amount must be a positive number up to ₹1,00,00,000.');
  }

  const validTypes = ['income', 'expense', 'transfer_savings'];
  if (!validTypes.includes(body.type)) {
    errors.push(`Invalid type. Must be one of: ${validTypes.join(', ')}.`);
  }

  const validClassifications = ['income', 'need', 'want', 'savings'];
  if (!validClassifications.includes(body.classification)) {
    errors.push(`Invalid classification. Must be one of: ${validClassifications.join(', ')}.`);
  }

  if (!validateDate(body.date)) {
    errors.push('Date must be a valid date in YYYY-MM-DD format.');
  }

  if (typeof body.category_name !== 'string' || body.category_name.trim().length === 0) {
    errors.push('Category name is required.');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateGoalPayload(body) {
  const errors = [];
  if (typeof body.title !== 'string' || body.title.trim().length === 0) {
    errors.push('Goal title is required.');
  }
  if (!validateAmount(body.target_amount)) {
    errors.push('Target amount must be a positive number.');
  }
  if (body.target_date && !validateDate(body.target_date)) {
    errors.push('Target date must be in YYYY-MM-DD format.');
  }
  return {
    isValid: errors.length === 0,
    errors
  };
}

