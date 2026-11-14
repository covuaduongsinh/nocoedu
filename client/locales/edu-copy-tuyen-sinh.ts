/**
 * NocoEdu wording for admissions (DS-61 phase D). Same shape as the rows in `./edu-copy.ts`:
 * `[key, Tiếng Việt, English, 中文]`.
 */
export const EDU_TUYEN_SINH_ROWS: readonly (readonly [
  string,
  string,
  string,
  string,
])[] = [
  ['nav.tuyenSinh', 'Tuyển sinh', 'Admissions', '招生'],
  ['tuyenSinh.title', 'Tuyển sinh', 'Admissions', '招生'],
  [
    'tuyenSinh.description',
    'Các gia đình chưa nhập học: tên phụ huynh, số điện thoại, cơ sở, kênh biết đến CLB, tình trạng và ngày gọi lại. Không lưu dữ liệu của trẻ; xóa liên hệ khi không còn cần.',
    'Families that have not enrolled: parent name, phone, branch, how they found the club, status and the day to call back. No data of the child is kept; delete a contact when it is no longer needed.',
    '尚未入学的家庭：家长姓名、电话、分校、了解渠道、状态和回访日期。不保存孩子的资料；不再需要时请删除联系人。',
  ],
  ['tuyenSinh.new', 'Thêm liên hệ', 'Add a contact', '新增联系人'],
  ['tuyenSinh.edit', 'Sửa liên hệ', 'Edit the contact', '编辑联系人'],
  ['tuyenSinh.delete', 'Xóa', 'Delete', '删除'],
  [
    'tuyenSinh.confirmDelete',
    'Xóa liên hệ này? Không khôi phục được.',
    'Delete this contact? It cannot be restored.',
    '删除此联系人？无法恢复。',
  ],
  [
    'tuyenSinh.purge',
    'Xóa liên hệ quá một năm',
    'Delete contacts older than a year',
    '删除超过一年的联系人',
  ],
  [
    'tuyenSinh.purgeHint',
    'Xóa mọi liên hệ tạo cách đây hơn một năm (theo quy tắc lưu trữ). Không khôi phục được.',
    'Deletes every contact made more than a year ago (the retention rule). It cannot be restored.',
    '删除所有创建超过一年的联系人（按保留规则）。无法恢复。',
  ],
  ['tuyenSinh.hoTen', 'Tên phụ huynh', 'Parent name', '家长姓名'],
  ['tuyenSinh.soDienThoai', 'Số điện thoại', 'Phone', '电话'],
  ['tuyenSinh.coSo', 'Cơ sở', 'Branch', '分校'],
  ['tuyenSinh.kenh', 'Kênh biết đến CLB', 'How they found us', '了解渠道'],
  ['tuyenSinh.trangThai', 'Tình trạng', 'Status', '状态'],
  ['tuyenSinh.ngayNhac', 'Ngày gọi lại', 'Call back on', '回访日期'],
  ['tuyenSinh.ghiChu', 'Ghi chú', 'Note', '备注'],
  ['tuyenSinh.empty', 'Chưa có liên hệ nào', 'No contacts yet', '暂无联系人'],
  [
    'tuyenSinh.emptyHint',
    'Bấm "Thêm liên hệ" để ghi một gia đình quan tâm đến CLB.',
    'Press "Add a contact" to record a family interested in the club.',
    '点击“新增联系人”记录对俱乐部感兴趣的家庭。',
  ],
  ['status.moi', 'Mới', 'New', '新'],
  ['status.dang_cham_soc', 'Đang chăm sóc', 'In progress', '跟进中'],
  ['status.da_chot', 'Đã chốt', 'Enrolled', '已报名'],
  ['status.khong_chot', 'Không chốt', 'Not enrolled', '未报名'],
];
