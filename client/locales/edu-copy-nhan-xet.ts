/**
 * NocoEdu wording for the monthly comments page that was still hard-coded in the page. Same shape as the rows in
 * `./edu-copy.ts`: `[key, Tiếng Việt, English, 中文]`.
 */
export const EDU_NHAN_XET_ROWS: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ['nhanXet.savedComment', 'Đã lưu nhận xét', 'Comment saved', '评语已保存'],
  [
    'nhanXet.charCount',
    '{{n}}/3000 ký tự',
    '{{n}}/3000 characters',
    '{{n}}/3000 字',
  ],
  [
    'nhanXet.historyTitle',
    '📋 Lịch Sử Nhận Xét Các Buổi Học ({{ky}})',
    '📋 Comments from the sessions ({{ky}})',
    '📋 各节课评语记录（{{ky}}）',
  ],
  ['nhanXet.studentLabel', 'Học viên:', 'Student:', '学员：'],
  [
    'nhanXet.stat.attended',
    'Số buổi tham gia',
    'Sessions attended',
    '出勤课次',
  ],
  [
    'nhanXet.stat.attendedValue',
    '{{present}}/{{total}} buổi',
    '{{present}}/{{total}} sessions',
    '{{present}}/{{total}} 节',
  ],
  ['nhanXet.stat.absent', 'Số buổi vắng', 'Sessions missed', '缺勤课次'],
  ['nhanXet.stat.sessionsN', '{{n}} buổi', '{{n}} sessions', '{{n}} 节'],
  [
    'nhanXet.stat.homeworkRate',
    'Tỷ lệ làm BTVN',
    'Homework done',
    '作业完成率',
  ],
  [
    'nhanXet.stat.awareness',
    'Điểm ý thức TB',
    'Average awareness score',
    '平均课堂表现分',
  ],
  [
    'nhanXet.timelineTitle',
    'Ghi chú & Nhận xét từng buổi của giáo viên',
    'Coach notes and comments per session',
    '教师对每节课的备注与评语',
  ],
  [
    'nhanXet.noSessions',
    'Không có buổi học nào trong giai đoạn này.',
    'There are no sessions in this period.',
    '该阶段没有课程。',
  ],
  ['nhanXet.absent', 'Vắng', 'Absent', '缺勤'],
  [
    'nhanXet.homework',
    'BTVN: {{state}}',
    'Homework: {{state}}',
    '作业：{{state}}',
  ],
  ['nhanXet.homeworkDone', 'Đã làm', 'Done', '已完成'],
  ['nhanXet.homeworkNotDone', 'Chưa làm', 'Not done', '未完成'],
  ['nhanXet.awareness', 'Ý thức:', 'Awareness:', '课堂表现：'],
  [
    'nhanXet.noOwnNote',
    'Không có ghi chú riêng',
    'No separate note',
    '没有单独备注',
  ],
];
