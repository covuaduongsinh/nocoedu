/** An amount of money the way the club writes it: `1.440.000`. */
export const formatVnd = (value: unknown): string =>
  (Number(value) || 0).toLocaleString('vi-VN');

const DIGITS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
];
const GROUPS = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

/** One group of three digits. `full` reads the hundreds even when they are zero ("không trăm linh năm"). */
function readGroup(value: number, full: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const words: string[] = [];
  if (hundreds > 0 || full) words.push(DIGITS[hundreds], 'trăm');
  if (tens === 0) {
    if (units > 0) {
      if (words.length > 0) words.push('linh');
      words.push(DIGITS[units]);
    }
    return words.join(' ');
  }
  words.push(tens === 1 ? 'mười' : `${DIGITS[tens]} mươi`);
  if (units === 1) words.push(tens === 1 ? 'một' : 'mốt');
  else if (units === 5) words.push('lăm');
  else if (units > 0) words.push(DIGITS[units]);
  return words.join(' ');
}

/**
 * An amount in Vietnamese words, as a receipt states it: `1440000` is "Một triệu bốn trăm bốn mươi nghìn đồng".
 * Always Vietnamese, whatever the language of the screen: it is the wording of a Vietnamese receipt in đồng, not a
 * label of the application. Whole, non-negative amounts below a million billion; anything else gives an empty text.
 */
export function amountInWords(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 1e18) return '';
  if (value === 0) return 'Không đồng';
  const groups: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1000))
    groups.push(rest % 1000);
  const words: string[] = [];
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (group === 0) continue;
    words.push(readGroup(group, index < groups.length - 1));
    if (GROUPS[index]) words.push(GROUPS[index]);
  }
  const sentence = `${words.join(' ')} đồng`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
