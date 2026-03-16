// ISIN validation and parsing — pure Luhn algorithm

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

const letterToDigits = (ch) => {
  const code = ch.charCodeAt(0) - 55; // A=10, B=11, ..., Z=35
  return code.toString();
};

const expandToDigits = (isin12) => {
  let digits = '';
  for (const ch of isin12) {
    if (ch >= 'A' && ch <= 'Z') {
      digits += letterToDigits(ch);
    } else {
      digits += ch;
    }
  }
  return digits;
};

const luhnCheck = (digitString) => {
  const digits = digitString.split('').map(Number);
  let sum = 0;

  // Process from right to left; double every second digit starting from second-to-last
  for (let i = digits.length - 1; i >= 0; i--) {
    let val = digits[i];
    // Double digits at even distance from the rightmost (check digit)
    if ((digits.length - 1 - i) % 2 === 1) {
      val *= 2;
      if (val > 9) { val -= 9; }
    }
    sum += val;
  }

  return sum % 10 === 0;
};

const computeCheckDigit = (isin11) => {
  const expanded = expandToDigits(isin11.toUpperCase());
  // Append 0 as placeholder, then find correct check digit
  const digits = expanded.split('').map(Number);

  // Use Luhn to compute: double from second-to-last (the 0 placeholder is last)
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    let val = digits[i];
    // Odd distance from rightmost placeholder position → double
    if ((digits.length - i) % 2 === 1) {
      val *= 2;
      if (val > 9) { val -= 9; }
    }
    sum += val;
  }

  return (10 - (sum % 10)) % 10;
};

// Valid ISO 3166-1 alpha-2 country codes (common ones used in ISINs)
const COUNTRY_CODES = new Set([
  'US', 'CA', 'GB', 'DE', 'FR', 'JP', 'AU', 'CH', 'NL', 'SE', 'NO', 'DK', 'FI',
  'IT', 'ES', 'PT', 'BE', 'AT', 'IE', 'LU', 'HK', 'SG', 'KR', 'TW', 'CN', 'IN',
  'BR', 'MX', 'ZA', 'NZ', 'IL', 'RU', 'PL', 'CZ', 'HU', 'TR', 'GR', 'CL', 'CO',
  'PE', 'AR', 'PH', 'TH', 'MY', 'ID', 'VN', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM',
  'EG', 'NG', 'KE', 'GH', 'XS', 'XA', 'XB', 'XC', 'XD', 'EU',
]);

const validate = (isin) => {
  if (!isin || typeof isin !== 'string') {
    return { valid: false, isin: isin || '', error: 'ISIN is required' };
  }

  const cleaned = isin.trim().toUpperCase();

  if (cleaned.length !== 12) {
    return { valid: false, isin: cleaned, error: `Invalid length: expected 12, got ${cleaned.length}` };
  }

  if (!ISIN_REGEX.test(cleaned)) {
    return { valid: false, isin: cleaned, error: 'Invalid format: must be 2 letters + 9 alphanumeric + 1 digit' };
  }

  const countryCode = cleaned.slice(0, 2);
  if (!COUNTRY_CODES.has(countryCode)) {
    return {
      valid: false,
      isin: cleaned,
      error: `Unknown country code: ${countryCode}`,
      note: 'Country code may be valid but is not in our recognized list',
    };
  }

  const expanded = expandToDigits(cleaned);
  const valid = luhnCheck(expanded);

  if (!valid) {
    const expected = computeCheckDigit(cleaned.slice(0, 11));
    return {
      valid: false,
      isin: cleaned,
      error: `Luhn check failed: expected check digit ${expected}, got ${cleaned[11]}`,
      checkDigit: { expected, actual: parseInt(cleaned[11], 10) },
    };
  }

  return {
    valid: true,
    isin: cleaned,
    countryCode,
  };
};

const parse = (isin) => {
  const validation = validate(isin);

  if (!validation.valid) {
    return { ...validation, parsed: false };
  }

  const cleaned = validation.isin;
  const countryCode = cleaned.slice(0, 2);
  const nsin = cleaned.slice(2, 11);
  const checkDigit = parseInt(cleaned[11], 10);

  // Check if NSIN contains a CUSIP (US and CA ISINs embed the CUSIP)
  const hasCusip = countryCode === 'US' || countryCode === 'CA';

  return {
    valid: true,
    isin: cleaned,
    parsed: true,
    countryCode,
    nsin,
    checkDigit,
    ...(hasCusip ? { embeddedCusip: nsin } : {}),
    description: {
      countryCode: `Country: ${countryCode}`,
      nsin: `National Securities Identifying Number: ${nsin}`,
      checkDigit: `Check digit: ${checkDigit}`,
      ...(hasCusip ? { cusip: `Embedded CUSIP: ${nsin}` } : {}),
    },
  };
};

export { validate, parse, computeCheckDigit };
