import type { StudyOptions } from '@memly/contracts';

export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/[‘’]/gu, "'")
    .replace(/[‐‑–—]/gu, '-');
}
function stylistic(value: string): string {
  const normalized = normalizeAnswer(value);
  // Keep punctuation that changes a formula, a number, or a word (C++, don't, 3.14).
  return /\p{L}/u.test(normalized) && !/[+*/=<>\d]/u.test(normalized)
    ? normalized.replace(/[.!?]+$/u, '').trim()
    : normalized;
}
function minorTypo(actual: string, expected: string): boolean {
  const a = [...actual.normalize('NFD').replace(/\p{M}/gu, '')];
  const b = [...expected.normalize('NFD').replace(/\p{M}/gu, '')];
  if (!/^[\p{L}\s'-]+$/u.test(actual) || !/^[\p{L}\s'-]+$/u.test(expected)) return false;
  if (a.join('') === b.join('')) return true;
  if (b.length < 5 || Math.max(a.length, b.length) > 200 || Math.abs(a.length - b.length) > 1)
    return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length > b.length) i++;
    else j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
export function answersEqual(actual: string, expected: string, options: StudyOptions): boolean {
  if (!actual.trim()) return false;
  const candidates = options.singleAnswer
    ? expected
        .split(/[,;/]/u)
        .map((s) => s.trim())
        .filter(Boolean)
    : [expected];
  return candidates.some((value) => {
    const a = options.grading ? stylistic(actual) : normalizeAnswer(actual),
      b = options.grading ? stylistic(value) : normalizeAnswer(value);
    return a === b || (options.grading === 'typos' && minorTypo(a, b));
  });
}
