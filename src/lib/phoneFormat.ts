/**
 * US-first phone formatting for the sign-in field.
 * Display looks like +1 (202) 555-0100; Firebase gets E.164 (+12025550100).
 */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function formatUsPhone(input: string): { display: string; e164: string } {
  let digits = digitsOnly(input)

  // National number is at most 10 digits; leading 1 is the country code.
  if (digits.startsWith('1')) {
    digits = digits.slice(0, 11)
  } else {
    digits = digits.slice(0, 10)
  }

  const national = digits.startsWith('1') ? digits.slice(1) : digits
  const e164 = national.length > 0 ? `+1${national}` : ''

  let body = ''
  if (national.length > 0) {
    body = ' ('
    body += national.slice(0, 3)
    if (national.length >= 3) {
      body += ')'
    }
    if (national.length > 3) {
      body += ` ${national.slice(3, 6)}`
    }
    if (national.length > 6) {
      body += `-${national.slice(6, 10)}`
    }
  }

  return { display: `+1${body}`, e164 }
}

export function isCompleteUsPhone(e164: string): boolean {
  return /^\+1\d{10}$/.test(e164)
}
