/**
 * NocoEdu wording for editing and removing records (DS-60 PR 4). Same shape as `./edu-copy.ts`.
 */
export const EDU_EDIT_ROWS: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ['edit.edit', 'Sửa', 'Edit', '编辑'],
  ['edit.note', 'Ghi chú của HLV', 'Coach note', '教练备注'],
  ['edit.unlink', 'Gỡ liên kết', 'Unlink', '解除关联'],
  [
    'edit.unlinkHint',
    'Chỉ gỡ liên kết giữa phụ huynh và học viên; hồ sơ phụ huynh vẫn còn.',
    'Only the link between the parent and the student is removed; the parent record stays.',
    '仅解除家长与学员的关联，家长档案保留。',
  ],
  [
    'edit.studentHint',
    'Đổi lớp sẽ ghi lại như một lần chuyển lớp. Số buổi còn lại và cấp độ không sửa ở đây.',
    'Changing the class is recorded as a move. The balance and the level are not edited here.',
    '更换班级将记为转班。剩余课时和级别不在此处修改。',
  ],
  ['edit.remove.coSo', 'Tạm dừng cơ sở', 'Pause branch', '暂停分校'],
  ['edit.remove.lop', 'Đóng lớp', 'Close class', '关闭班级'],
  ['edit.remove.hocVien', 'Cho nghỉ học', 'Mark as left', '标记退学'],
  ['edit.remove.phuHuynh', 'Xóa phụ huynh', 'Delete parent', '删除家长'],
  [
    'edit.removeHint.coSo',
    'Cơ sở chuyển sang “Tạm dừng”. Lớp, học viên và lịch sử vẫn được giữ; có thể mở lại bằng nút Sửa.',
    'The branch becomes “Paused”. Classes, students and history are kept; reopen it with Edit.',
    '分校将变为“暂停”。班级、学员和历史记录保留；可通过“编辑”重新开启。',
  ],
  [
    'edit.removeHint.lop',
    'Lớp chuyển sang “Đã đóng”. Học viên, buổi học và điểm danh vẫn được giữ.',
    'The class becomes “Closed”. Students, sessions and attendance are kept.',
    '班级将变为“已关闭”。学员、课节和考勤记录保留。',
  ],
  [
    'edit.removeHint.hocVien',
    'Học viên chuyển sang “Đã nghỉ”, không bị xóa. Điểm danh, gói buổi và số dư vẫn được giữ.',
    'The student becomes “Left” and is not deleted. Attendance, packages and balance are kept.',
    '学员将变为“已退出”，不会被删除。考勤、课时包和余额保留。',
  ],
  [
    'edit.removeHint.phuHuynh',
    'Chỉ Quản trị xóa được, và chỉ khi phụ huynh không còn gắn với học viên nào và không có bản ghi đồng ý. Nếu còn, hãy gỡ liên kết trước.',
    'Only an administrator can delete, and only when the parent is linked to no student and has no consent on record. Unlink first otherwise.',
    '仅管理员可删除，且仅当家长未关联任何学员且无同意记录时才能删除，否则请先解除关联。',
  ],
  ['status.hoc_thu', 'Học thử', 'Trial', '试课'],
  [
    'errors.EDU_INVALID_VALUE',
    'Giá trị nhập chưa hợp lệ. Hãy kiểm tra lại các ô.',
    'A value is not valid. Please check the fields.',
    '输入的值无效，请检查各字段。',
  ],
  [
    'errors.EDU_INVALID_STATUS',
    'Trạng thái chọn chưa hợp lệ.',
    'The chosen status is not valid.',
    '所选状态无效。',
  ],
  [
    'errors.EDU_PARENT_IN_USE',
    'Phụ huynh còn gắn với học viên hoặc có bản ghi đồng ý nên chưa xóa được. Hãy gỡ liên kết trước.',
    'The parent is still linked to a student or has a consent on record. Unlink first.',
    '该家长仍关联学员或有同意记录，暂无法删除。请先解除关联。',
  ],
  [
    'errors.EDU_PARENT_NOT_FOUND',
    'Không tìm thấy phụ huynh.',
    'Parent not found.',
    '未找到家长。',
  ],
];
