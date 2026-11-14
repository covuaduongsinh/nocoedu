/**
 * The message a coach pastes into Zalo for a parent. Plain text, Vietnamese, with the short form of the student's
 * name (knowledge document 05). The club name is in the closing line; no phone number or address is included.
 */
/**
 * A comment belongs to a month (`2026-05`), to a periodic review after five sessions (`2026-K3`: the third of 2026) or
 * to the year-end summary (`2026-CN`). The key is stored in `thang` (7 characters), so no column or permission changes.
 */
export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2]|K[1-9]|CN)$/u;

/** The line that says what the comment is about: month, periodic review or year-end summary. */
export function periodLabel(period: string): string {
  const [year = '', rest = ''] = period.split('-');
  if (rest === 'CN') return `Tổng kết cuối năm ${year}`;
  if (rest.startsWith('K'))
    return `Nhận xét định kỳ lần ${rest.slice(1)} năm ${year}`;
  return `Nhận xét tháng ${Number(rest)}/${year}`;
}

export function eduMessage(input: {
  studentName: string;
  month: string;
  comment: string;
}): string {
  return [
    `Kính gửi quý phụ huynh,`,
    ``,
    `${periodLabel(input.month)} của bé ${input.studentName}:`,
    input.comment.trim(),
    ``,
    `Trân trọng,`,
    `CLB Cờ vua Dương Sinh`,
  ].join('\n');
}
