/**
 * NocoEdu wording for exporting students and parents to a CSV file (DS-60 PR 6). Same shape as `./edu-copy.ts`.
 */
export const EDU_EXPORT_ROWS: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ['export.open', 'Xuất CSV', 'Export CSV', '导出 CSV'],
  [
    'export.title',
    'Xuất học viên và phụ huynh ra tệp CSV',
    'Export students and parents to a CSV file',
    '将学员和家长导出为 CSV 文件',
  ],
  [
    'export.hint',
    'Tệp có cùng cột với tệp nhập nên có thể sửa rồi nhập lại. Chỉ gồm họ tên, năm sinh, mã cơ sở và lớp, cấp, và phụ huynh (họ tên, số điện thoại, zalo, quan hệ); không có ngày sinh đầy đủ hay ghi chú. Học viên chưa có phụ huynh có các cột phụ huynh để trống. Nhập lại nguyên tệp này thì các dòng khớp học viên đã có chỉ bị bỏ qua (không ghi gì), kể cả lớp đã đóng hay cơ sở tạm dừng. Mỗi lần xuất được ghi nhật ký (ai, khi nào, bộ lọc, số dòng, không có tên). Đây là dữ liệu trẻ em: không gửi qua kênh công khai.',
    'The file has the same columns as the import file, so it can be edited and imported again. It holds only name, birth year, branch and class code, level, and the parents (name, phone, zalo, relation); no full date of birth or notes. A student without a parent has empty parent columns. Importing the whole file again only skips the rows that match existing students (nothing is written), even for a closed class or a paused branch. Every export is logged (who, when, filter, row count, no names). This is children’s data: do not send it over public channels.',
    '文件的列与导入文件相同，可修改后重新导入。仅包含姓名、出生年份、分校和班级编号、级别以及家长（姓名、电话、zalo、关系）；不含完整出生日期或备注。没有家长的学员，家长列为空。整体重新导入时，与已有学员匹配的行只会被跳过（不写入任何内容），即使班级已关闭或分校已暂停。每次导出都会记录日志（谁、何时、筛选条件、行数，不含姓名）。这是儿童数据：请勿通过公开渠道发送。',
  ],
  ['export.download', 'Tải xuống', 'Download', '下载'],
  ['export.downloading', 'Đang xuất…', 'Exporting…', '正在导出…'],
  [
    'errors.EDU_EXPORT_TOO_LARGE',
    'Có quá nhiều học viên (hơn 5.000). Hãy chọn một cơ sở hoặc một lớp.',
    'Too many students (over 5,000). Choose one branch or class.',
    '学员过多（超过 5,000 人）。请选择一个分校或班级。',
  ],
];
