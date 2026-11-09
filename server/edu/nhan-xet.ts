/**
 * The message a coach pastes into Zalo for a parent. Plain text, Vietnamese, with the short form of the student's
 * name (knowledge document 05). The club name is in the closing line; no phone number or address is included.
 */
export function eduMessage(input: {
  studentName: string;
  month: string;
  comment: string;
}): string {
  const [year, month] = input.month.split('-');
  return [
    `Kính gửi quý phụ huynh,`,
    ``,
    `Nhận xét tháng ${Number(month)}/${year} của bé ${input.studentName}:`,
    input.comment.trim(),
    ``,
    `Trân trọng,`,
    `CLB Cờ vua Dương Sinh`,
  ].join('\n');
}
