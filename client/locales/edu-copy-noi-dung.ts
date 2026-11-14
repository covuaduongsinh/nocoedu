/**
 * NocoEdu wording for the session content, the awareness score and the negative-balance report (DS-61). Same shape as
 * `./edu-copy.ts`: `[key, Tiếng Việt, English, 中文]`.
 */
export const EDU_NOI_DUNG_ROWS: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ['diemDanh.awareness', 'Ý thức (0–10)', 'Awareness (0–10)', '专注度（0–10）'],
  [
    'diemDanh.awarenessHint',
    'Chấm ý thức sau khi đã lưu điểm danh.',
    'Score awareness after the attendance is saved.',
    '请在保存点名后再打分。',
  ],
  [
    'diemDanh.content.title',
    'Nội dung buổi học',
    'Session content',
    '课堂内容',
  ],
  ['diemDanh.content.keHoachDay', 'Kế hoạch dạy', 'Teaching plan', '教学计划'],
  ['diemDanh.content.kienThucMoi', 'Kiến thức mới', 'New knowledge', '新知识'],
  [
    'diemDanh.content.giaoBtvn',
    'Bài tập về nhà',
    'Homework given',
    '布置的作业',
  ],
  [
    'diemDanh.content.keHoachBuoiSau',
    'Kế hoạch buổi sau',
    'Plan for the next session',
    '下节课计划',
  ],
  [
    'diemDanh.content.save',
    'Lưu nội dung và ý thức',
    'Save content and awareness',
    '保存内容与专注度',
  ],
  [
    'diemDanh.content.saved',
    'Đã lưu nội dung buổi học.',
    'The session content was saved.',
    '课堂内容已保存。',
  ],
  [
    'baoCao.k.soDuAm',
    'Số dư âm (cần báo nộp học phí)',
    'Negative balance (fee due)',
    '余额为负（需缴费）',
  ],
  ['baoCao.col.buoiNo', 'Số buổi nợ', 'Sessions owed', '欠课时'],
  [
    'errors.EDU_ATTENDANCE_NOT_FOUND',
    'Hãy lưu điểm danh của học viên này trước.',
    'Take the attendance of this student first.',
    '请先为该学员点名。',
  ],
  [
    'errors.EDU_SESSION_NOT_FOUND',
    'Không tìm thấy buổi học.',
    'Session not found.',
    '未找到课次。',
  ],
];
