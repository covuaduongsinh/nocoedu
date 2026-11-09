/**
 * NocoEdu wording in the three languages the application ships. Each row is `[key, Tiếng Việt, English, 中文]`.
 * Vietnamese is the club's language and the application's default; English and Chinese keep the locale files in
 * step. Keys are dotted paths below the `edu` group.
 */
import { EDU_MORE_ROWS } from './edu-copy-more.js';

type Row = readonly [key: string, vi: string, en: string, zh: string];

const ROWS: readonly Row[] = [
  ['nav.home', 'Trang chủ', 'Home', '首页'],
  ['nav.coSo', 'Cơ sở', 'Branches', '分校'],
  ['nav.lop', 'Lớp học', 'Classes', '班级'],
  ['nav.hocVien', 'Học viên', 'Students', '学员'],
  ['nav.phuHuynh', 'Phụ huynh', 'Parents', '家长'],

  ['common.create', 'Thêm mới', 'Add', '新增'],
  ['common.save', 'Lưu', 'Save', '保存'],
  ['common.saving', 'Đang lưu…', 'Saving…', '保存中…'],
  ['common.cancel', 'Hủy', 'Cancel', '取消'],
  ['common.loading', 'Đang tải…', 'Loading…', '加载中…'],
  ['common.retry', 'Thử lại', 'Try again', '重试'],
  ['common.actions', 'Thao tác', 'Actions', '操作'],
  ['common.none', 'Chưa có', 'None', '无'],
  ['common.choose', 'Chọn…', 'Choose…', '请选择'],
  ['common.yes', 'Có', 'Yes', '是'],
  ['common.no', 'Không', 'No', '否'],
  [
    'common.loadError',
    'Không tải được dữ liệu. Vui lòng thử lại.',
    'The data could not be loaded. Please try again.',
    '无法加载数据，请重试。',
  ],
  [
    'common.saveError',
    'Không lưu được. Vui lòng kiểm tra thông tin rồi thử lại.',
    'Could not save. Check the details and try again.',
    '无法保存，请检查后重试。',
  ],
  [
    'common.limit',
    'Hiển thị tối đa 100 dòng đầu tiên.',
    'Showing the first 100 rows.',
    '最多显示前 100 行。',
  ],

  [
    'errors.EDU_OUT_OF_SCOPE',
    'Bạn không có quyền thêm dữ liệu ở cơ sở hoặc lớp này.',
    'You may not add data for this branch or class.',
    '您无权在此分校或班级添加数据。',
  ],
  [
    'errors.EDU_CLASS_NOT_IN_BRANCH',
    'Lớp được chọn không thuộc cơ sở này.',
    'The chosen class does not belong to this branch.',
    '所选班级不属于此分校。',
  ],
  [
    'errors.EDU_INVALID_PHONE',
    'Số điện thoại chưa đúng.',
    'The phone number is not valid.',
    '电话号码无效。',
  ],
  [
    'errors.EDU_PARENT_ALREADY_LINKED',
    'Phụ huynh này đã được gắn với học viên.',
    'This parent is already linked to the student.',
    '该家长已关联此学员。',
  ],
  [
    'errors.EDU_LEVEL_NOT_HIGHER',
    'Cấp mới phải cao hơn cấp hiện tại.',
    'The new level must be higher than the current one.',
    '新级别必须高于当前级别。',
  ],
  [
    'errors.EDU_LEVEL_CHANGED',
    'Cấp của học viên vừa thay đổi. Hãy tải lại rồi thử lại.',
    'The level of the student has just changed. Reload and try again.',
    '学员级别刚刚发生变化，请刷新后重试。',
  ],
  [
    'errors.EDU_OUT_OF_SCOPE',
    'Bạn không được thao tác trên dữ liệu của cơ sở hoặc lớp này.',
    'You may not work on the data of this branch or class.',
    '您无权操作此分校或班级的数据。',
  ],
  [
    'errors.PERMISSION_DENIED',
    'Bạn không có quyền thực hiện thao tác này.',
    'You are not allowed to do this.',
    '您无权执行此操作。',
  ],
  [
    'errors.generic',
    'Có lỗi xảy ra. Vui lòng thử lại.',
    'Something went wrong. Please try again.',
    '出错了，请重试。',
  ],

  ['level.tot', 'Tốt', 'Pawn', '兵'],
  ['level.ma', 'Mã', 'Knight', '马'],
  ['level.tuong', 'Tượng', 'Bishop', '象'],
  ['level.xe', 'Xe', 'Rook', '车'],
  ['level.hau', 'Hậu', 'Queen', '后'],
  ['level.vua', 'Vua', 'King', '王'],

  ['status.hoat_dong', 'Đang hoạt động', 'Active', '运营中'],
  ['status.tam_dung', 'Tạm dừng', 'Paused', '暂停'],
  ['status.dang_mo', 'Đang mở', 'Open', '开放'],
  ['status.da_dong', 'Đã đóng', 'Closed', '已关闭'],
  ['status.dang_hoc', 'Đang học', 'Studying', '在读'],
  ['status.tam_nghi', 'Tạm nghỉ', 'On break', '休学'],
  ['status.da_nghi', 'Đã nghỉ', 'Left', '已退出'],

  ['relation.bo', 'Bố', 'Father', '父亲'],
  ['relation.me', 'Mẹ', 'Mother', '母亲'],
  ['relation.ong', 'Ông', 'Grandfather', '祖父'],
  ['relation.ba', 'Bà', 'Grandmother', '祖母'],
  ['relation.nguoi_giam_ho', 'Người giám hộ', 'Guardian', '监护人'],
  ['relation.khac', 'Khác', 'Other', '其他'],

  [
    'home.title',
    'NocoEdu - Cờ vua Dương Sinh',
    'NocoEdu - Duong Sinh Chess',
    'NocoEdu - 阳生国际象棋',
  ],
  [
    'home.intro',
    'Quản lý học viên, lớp và cơ sở của CLB.',
    'Manage the club’s students, classes and branches.',
    '管理俱乐部的学员、班级和分校。',
  ],
  [
    'home.students',
    'Học viên bạn xem được',
    'Students you can see',
    '您可查看的学员',
  ],
  ['home.classes', 'Lớp bạn xem được', 'Classes you can see', '您可查看的班级'],
  [
    'home.noAccess',
    'Tài khoản của bạn chưa được gán vai trò NocoEdu. Hãy nhờ quản trị viên gán vai trò.',
    'Your account has no NocoEdu role yet. Ask an administrator to assign one.',
    '您的账号尚未分配 NocoEdu 角色，请联系管理员。',
  ],
  ['home.open', 'Mở', 'Open', '打开'],

  ['coSo.title', 'Cơ sở', 'Branches', '分校'],
  [
    'coSo.description',
    'Các cơ sở của CLB và cách tính buổi khi học viên vắng có phép.',
    'The club’s branches and how an excused absence is counted.',
    '俱乐部分校及请假的计课方式。',
  ],
  ['coSo.new', 'Thêm cơ sở', 'Add a branch', '新增分校'],
  ['coSo.ma', 'Mã', 'Code', '编号'],
  ['coSo.ten', 'Tên cơ sở', 'Name', '名称'],
  ['coSo.diaChi', 'Địa chỉ', 'Address', '地址'],
  [
    'coSo.truBuoi',
    'Vắng có phép vẫn trừ buổi',
    'Excused absence still uses a session',
    '请假仍扣课时',
  ],
  ['coSo.trangThai', 'Trạng thái', 'Status', '状态'],
  [
    'coSo.empty',
    'Chưa có cơ sở nào.',
    'There are no branches yet.',
    '还没有分校。',
  ],
  [
    'coSo.emptyHint',
    'Bấm "Thêm cơ sở" để tạo cơ sở đầu tiên.',
    'Choose “Add a branch” to create the first one.',
    '点击“新增分校”创建第一个。',
  ],

  ['lop.title', 'Lớp học', 'Classes', '班级'],
  [
    'lop.description',
    'Lớp theo cơ sở, huấn luyện viên và cấp trong lộ trình 6 cấp.',
    'Classes by branch, coach and level on the six-level path.',
    '按分校、教练和六级路线划分的班级。',
  ],
  ['lop.new', 'Thêm lớp', 'Add a class', '新增班级'],
  ['lop.ma', 'Mã lớp', 'Code', '编号'],
  ['lop.ten', 'Tên lớp', 'Name', '名称'],
  ['lop.coSo', 'Cơ sở', 'Branch', '分校'],
  ['lop.level', 'Cấp', 'Level', '级别'],
  ['lop.hlv', 'Mã tài khoản HLV', 'Coach account id', '教练账号 ID'],
  ['lop.trangThai', 'Trạng thái', 'Status', '状态'],
  [
    'lop.empty',
    'Chưa có lớp nào.',
    'There are no classes yet.',
    '还没有班级。',
  ],
  [
    'lop.emptyHint',
    'Tạo cơ sở trước, rồi thêm lớp cho cơ sở đó.',
    'Create a branch first, then add its classes.',
    '请先创建分校，再添加班级。',
  ],

  ['hocVien.title', 'Học viên', 'Students', '学员'],
  [
    'hocVien.description',
    'Hồ sơ học viên: năm sinh, cấp hiện tại, lớp và ghi chú của HLV.',
    'Student profiles: birth year, current level, class and coach notes.',
    '学员档案：出生年份、当前级别、班级和教练备注。',
  ],
  ['hocVien.new', 'Thêm học viên', 'Add a student', '新增学员'],
  ['hocVien.ma', 'Mã', 'Code', '编号'],
  ['hocVien.hoTen', 'Họ và tên', 'Full name', '姓名'],
  ['hocVien.namSinh', 'Năm sinh', 'Birth year', '出生年份'],
  ['hocVien.level', 'Cấp hiện tại', 'Current level', '当前级别'],
  ['hocVien.lop', 'Lớp', 'Class', '班级'],
  ['hocVien.coSo', 'Cơ sở', 'Branch', '分校'],
  ['hocVien.trangThai', 'Trạng thái', 'Status', '状态'],
  ['hocVien.soBuoi', 'Số buổi còn lại', 'Sessions left', '剩余课时'],
  ['hocVien.ghiChu', 'Ghi chú của HLV', 'Coach note', '教练备注'],
  [
    'hocVien.empty',
    'Chưa có học viên nào.',
    'There are no students yet.',
    '还没有学员。',
  ],
  [
    'hocVien.emptyHint',
    'Bấm "Thêm học viên" để nhập học viên đầu tiên.',
    'Choose “Add a student” to enter the first one.',
    '点击“新增学员”录入第一位。',
  ],
  ['hocVien.noClass', 'Chưa xếp lớp', 'No class yet', '未分班'],
  ['hocVien.levelUp', 'Lên cấp', 'Level up', '升级'],
  [
    'hocVien.levelUpTitle',
    'Xác nhận lên cấp',
    'Confirm a level-up',
    '确认升级',
  ],
  [
    'hocVien.levelUpHint',
    'Chỉ xác nhận khi HLV đã đánh giá học viên đạt cấp mới. Hệ thống không tự lên cấp.',
    'Confirm only after the coach has assessed the student at the new level. The system never promotes on its own.',
    '仅在教练评估学员达到新级别后确认，系统不会自动升级。',
  ],
  ['hocVien.newLevel', 'Cấp mới', 'New level', '新级别'],
  ['hocVien.addParent', 'Thêm phụ huynh', 'Add a parent', '添加家长'],
  ['hocVien.parentName', 'Họ tên phụ huynh', 'Parent name', '家长姓名'],
  ['hocVien.parentPhone', 'Số điện thoại', 'Phone number', '电话'],
  [
    'hocVien.parentZalo',
    'Zalo (không bắt buộc)',
    'Zalo (optional)',
    'Zalo（可选）',
  ],
  [
    'hocVien.parentRelation',
    'Quan hệ với học viên',
    'Relationship',
    '与学员的关系',
  ],
  [
    'hocVien.parentHint',
    'Nếu số điện thoại đã có, hệ thống dùng lại phụ huynh đó (một phụ huynh nhiều con).',
    'If the phone number already exists, that parent is reused (one parent, several children).',
    '若电话已存在，将复用该家长（一位家长可有多个孩子）。',
  ],

  ['phuHuynh.title', 'Phụ huynh', 'Parents', '家长'],
  [
    'phuHuynh.description',
    'Liên hệ của phụ huynh. Mỗi phụ huynh có thể có nhiều con.',
    'Parent contacts. One parent can have several children.',
    '家长联系方式，一位家长可有多个孩子。',
  ],
  ['phuHuynh.ma', 'Mã', 'Code', '编号'],
  ['phuHuynh.hoTen', 'Họ và tên', 'Name', '姓名'],
  ['phuHuynh.soDienThoai', 'Số điện thoại', 'Phone', '电话'],
  ['phuHuynh.zalo', 'Zalo', 'Zalo', 'Zalo'],
  [
    'phuHuynh.empty',
    'Chưa có phụ huynh nào.',
    'There are no parents yet.',
    '还没有家长。',
  ],
  [
    'phuHuynh.emptyHint',
    'Thêm phụ huynh từ trang Học viên.',
    'Add a parent from the Students page.',
    '请在“学员”页面添加家长。',
  ],
];

type Tree = { [key: string]: string | Tree };

function build(index: 1 | 2 | 3): Tree {
  const root: Tree = {};
  for (const row of [...ROWS, ...EDU_MORE_ROWS]) {
    const parts = row[0].split('.');
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const next = node[part];
      node = typeof next === 'object' ? next : (node[part] = {});
    }
    node[parts[parts.length - 1] ?? ''] = row[index];
  }
  return root;
}

export const eduViVN = build(1);
export const eduEnUS = build(2);
export const eduZhCN = build(3);
