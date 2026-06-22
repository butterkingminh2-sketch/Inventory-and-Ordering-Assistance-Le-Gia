/** Pure function — no DB calls. Strips Vietnamese diacritics, including đ/Đ which NFD does not decompose. */
export function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}
