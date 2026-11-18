/**
 * NocoEdu wording for the backup page (GĐ 0 follow-up). Same shape as the rows in `./edu-copy.ts`:
 * `[key, Tiếng Việt, English, 中文]`.
 */
export const EDU_SAO_LUU_ROWS: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  [
    'saoLuu.childData',
    'Tệp sao lưu chứa dữ liệu của trẻ em (ngày sinh, số điện thoại phụ huynh). Lưu ở nơi an toàn, không gửi qua kênh chat hoặc email, và xoá khi không còn cần.',
    'The backup file holds the data of children (birth dates, parents’ phone numbers). Keep it somewhere safe, never send it through chat or e-mail, and delete it when it is no longer needed.',
    '备份文件包含儿童资料（出生日期、家长电话）。请妥善保存，不要通过聊天或邮件发送，不再需要时请删除。',
  ],
  [
    'saoLuu.checking',
    'Đang kiểm tra tệp…',
    'Checking the file…',
    '正在检查文件…',
  ],
  [
    'saoLuu.checkResult',
    'Sẽ thêm {{moi}} bản ghi; {{trung}} bản ghi đã có sẽ được giữ nguyên (khôi phục không ghi đè).',
    '{{moi}} records will be added; {{trung}} records that already exist are kept as they are (a restore never overwrites).',
    '将新增 {{moi}} 条记录；已存在的 {{trung}} 条记录保持不变（恢复不会覆盖）。',
  ],
  [
    'saoLuu.checkFailed',
    'Tệp không hợp lệ hoặc không đọc được: {{message}}',
    'The file is not valid or cannot be read: {{message}}',
    '文件无效或无法读取：{{message}}',
  ],
  [
    'saoLuu.sequenceWarning',
    'Đã khôi phục, nhưng máy chủ chưa đặt lại được dãy số tự tăng của PostgreSQL. Báo quản trị hệ thống chạy lệnh đặt lại trước khi nhập thêm dữ liệu.',
    'Restored, but the server could not move the PostgreSQL id sequences. Ask the system administrator to run the reset statement before more data is entered.',
    '已恢复，但服务器未能重置 PostgreSQL 的自增序列。请在继续录入前联系系统管理员执行重置语句。',
  ],
];
