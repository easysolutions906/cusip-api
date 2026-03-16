// CUSIP validation and parsing — pure algorithm, no data dependencies

const CUSIP_REGEX = /^[A-Z0-9*@#]{9}$/i;

const charToValue = (ch) => {
  const c = ch.toUpperCase();
  if (c >= '0' && c <= '9') { return c.charCodeAt(0) - 48; }
  if (c >= 'A' && c <= 'Z') { return c.charCodeAt(0) - 55; } // A=10, B=11, ..., Z=35
  if (c === '*') { return 36; }
  if (c === '@') { return 37; }
  if (c === '#') { return 38; }
  return -1;
};

const computeCheckDigit = (cusip8) => {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let val = charToValue(cusip8[i]);
    if (val < 0) { return -1; }

    // Double even-positioned values (0-indexed)
    if (i % 2 === 1) {
      val *= 2;
    }

    // Add digits: integer division by 10 + remainder
    sum += Math.floor(val / 10) + (val % 10);
  }

  return (10 - (sum % 10)) % 10;
};

const validate = (cusip) => {
  if (!cusip || typeof cusip !== 'string') {
    return { valid: false, cusip: cusip || '', error: 'CUSIP is required' };
  }

  const cleaned = cusip.trim().toUpperCase();

  if (cleaned.length !== 9) {
    return { valid: false, cusip: cleaned, error: `Invalid length: expected 9, got ${cleaned.length}` };
  }

  if (!CUSIP_REGEX.test(cleaned)) {
    return { valid: false, cusip: cleaned, error: 'Invalid characters: CUSIP must be alphanumeric plus *, @, #' };
  }

  const expectedCheckDigit = computeCheckDigit(cleaned.slice(0, 8));
  const actualCheckDigit = parseInt(cleaned[8], 10);

  if (isNaN(actualCheckDigit)) {
    return { valid: false, cusip: cleaned, error: 'Check digit must be numeric (0-9)' };
  }

  const valid = expectedCheckDigit === actualCheckDigit;

  return {
    valid,
    cusip: cleaned,
    ...(valid ? {} : {
      error: `Check digit mismatch: expected ${expectedCheckDigit}, got ${actualCheckDigit}`,
    }),
    checkDigit: { expected: expectedCheckDigit, actual: actualCheckDigit },
  };
};

const parse = (cusip) => {
  const validation = validate(cusip);

  if (!validation.valid) {
    return { ...validation, parsed: false };
  }

  const cleaned = validation.cusip;

  return {
    valid: true,
    cusip: cleaned,
    parsed: true,
    issuer: cleaned.slice(0, 6),
    issue: cleaned.slice(6, 8),
    checkDigit: parseInt(cleaned[8], 10),
    description: {
      issuer: `Issuer code: ${cleaned.slice(0, 6)}`,
      issue: `Issue number: ${cleaned.slice(6, 8)}`,
      checkDigit: `Check digit: ${cleaned[8]}`,
    },
  };
};

export { validate, parse, computeCheckDigit };
