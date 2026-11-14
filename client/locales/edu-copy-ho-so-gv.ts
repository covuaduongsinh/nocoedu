/**
 * NocoEdu wording for the coach profiles and pay (DS-61 phase F). Same shape as the rows in `./edu-copy.ts`:
 * `[key, Tiếng Việt, English, 中文]`.
 */
export const EDU_HO_SO_GV_ROWS: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ['nav.hoSoGv', 'Giáo viên', 'Coaches', '教练'],
  ['hoSoGv.title', 'Giáo viên và thù lao', 'Coaches and pay', '教练与薪酬'],
  [
    'hoSoGv.description',
    'Hồ sơ tối thiểu của giáo viên (tên ngắn, vị trí, tình trạng) và thù lao mỗi buổi. Chỉ Quản trị xem được trang này.',
    'The minimal profile of a coach (short name, position, status) and the pay for one session. Only the administrator sees this page.',
    '教练的最简档案（简称、职位、状态）和每节课薪酬。仅管理员可见此页。',
  ],
  ['hoSoGv.new', 'Thêm hồ sơ', 'Add a profile', '新增档案'],
  ['hoSoGv.edit', 'Sửa hồ sơ', 'Edit the profile', '编辑档案'],
  ['hoSoGv.tai', 'Tài khoản giáo viên', 'Coach account', '教练账号'],
  ['hoSoGv.tenVietTat', 'Tên viết tắt', 'Short name', '简称'],
  ['hoSoGv.viTri', 'Vị trí', 'Position', '职位'],
  ['hoSoGv.tinhTrang', 'Tình trạng', 'Status', '状态'],
  [
    'hoSoGv.thuLaoMotBuoi',
    'Thù lao mỗi buổi (đồng)',
    'Pay per session (VND)',
    '每节课薪酬（越南盾）',
  ],
  ['hoSoGv.empty', 'Chưa có hồ sơ nào', 'No profiles yet', '暂无档案'],
  [
    'hoSoGv.emptyHint',
    'Tạo tài khoản giáo viên và gán bộ quyền HLV trước, rồi thêm hồ sơ cho tài khoản đó.',
    'Create the coach account and give it the coach role first, then add its profile.',
    '请先创建教练账号并赋予教练角色，再为其添加档案。',
  ],
  ['hoSoGv.thuLaoTitle', 'Thù lao theo tháng', 'Pay by month', '按月薪酬'],
  [
    'hoSoGv.thuLaoHint',
    'Số buổi đã điểm danh trong tháng nhân thù lao mỗi buổi.',
    'Sessions with attendance taken in the month times the pay per session.',
    '当月已点名的课时数乘以每节课薪酬。',
  ],
  ['hoSoGv.thang', 'Tháng', 'Month', '月份'],
  ['hoSoGv.soBuoi', 'Số buổi', 'Sessions', '课时数'],
  ['hoSoGv.tong', 'Thành tiền (đồng)', 'Amount (VND)', '金额（越南盾）'],
  ['hoSoGv.tongCong', 'Tổng cộng', 'Total', '合计'],
  ['status.dang_lam', 'Đang làm', 'Working', '在职'],
  ['status.da_nghi_viec', 'Đã nghỉ', 'Left', '已离职'],
  ['hoSoGv.chiTietBuoiDay', 'Chi tiết ca dạy', 'Teaching sessions detail', '授课明细'],
  ['hoSoGv.chiTietTitle', 'Chi tiết ca dạy trong tháng', 'Teaching sessions in month', '当月授课明细'],
  ['hoSoGv.chiTietHint', 'Danh sách các buổi học giáo viên đã điểm danh trong tháng.', 'List of sessions marked by the coach in this month.', '教练当月已完成点名的课程列表。'],
  ['hoSoGv.noSessions', 'Không có buổi dạy nào trong tháng này.', 'No sessions taught this month.', '本月无授课记录。'],
  ['hoSoGv.ngay', 'Ngày học', 'Date', '上课日期'],
  ['hoSoGv.gio', 'Giờ học', 'Time', '上课时间'],
  ['hoSoGv.lop', 'Lớp học', 'Class', '班级'],
  ['hoSoGv.viewSessions', 'Xem ca dạy', 'View sessions', '查看明细'],
];
