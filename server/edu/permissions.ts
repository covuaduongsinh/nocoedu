import { defineCompositeResource } from '@nocobase/authorization/core';
import { defineDatabasePermission } from '@nocobase/app-plugin-authorization/server';

/**
 * Business permission model of NocoEdu. Code defines what each action may read and write; the permission sets
 * seeded by `database/main/seeds` choose who holds an action and over which records (`edu.all`, `edu.myBranches`,
 * `edu.myClasses`). Nothing here grants access to anybody.
 */

export const COLLECTIONS = {
  coSo: { name: 'eduCoSo', title: 'Cơ sở' },
  coSoQuanLy: { name: 'eduCoSoQuanLy', title: 'Người quản lý cơ sở' },
  lop: { name: 'eduLop', title: 'Lớp' },
  lopLich: { name: 'eduLopLich', title: 'Lịch học của lớp' },
  hocVien: { name: 'eduHocVien', title: 'Học viên' },
  lenCap: { name: 'eduHocVienLenCap', title: 'Lịch sử lên cấp' },
  phuHuynh: { name: 'eduPhuHuynh', title: 'Phụ huynh' },
  lienKet: { name: 'eduHocVienPhuHuynh', title: 'Phụ huynh của học viên' },
  dongY: { name: 'eduDongY', title: 'Đồng ý của phụ huynh' },
  buoiHoc: { name: 'eduBuoiHoc', title: 'Buổi học' },
  diemDanh: { name: 'eduDiemDanh', title: 'Điểm danh' },
  goiHoc: { name: 'eduGoiHoc', title: 'Gói buổi' },
  thanhToan: { name: 'eduThanhToan', title: 'Thanh toán' },
  soDuNhatKy: { name: 'eduSoDuNhatKy', title: 'Nhật ký số dư buổi' },
  nhanXetThang: { name: 'eduNhanXetThang', title: 'Nhận xét tháng' },
  xuatDuLieu: { name: 'eduXuatDuLieuNhatKy', title: 'Nhật ký xuất dữ liệu' },
  sach: { name: 'eduSach', title: 'Sách' },
  phatSach: { name: 'eduPhatSach', title: 'Phát sách' },
  lienHe: { name: 'eduLienHe', title: 'Liên hệ tuyển sinh' },
  hoSoGv: { name: 'eduHoSoGv', title: 'Hồ sơ giáo viên' },
  sachHoc: { name: 'eduSachHoc', title: 'Sách đã và đang học' },
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

/** Fields a client may read and (separately) write, per collection. `id` is never writable. */
export const FIELDS = {
  coSo: {
    read: [
      'id',
      'ma',
      'ten',
      'diaChi',
      'nguoiPhuTrachId',
      'truBuoiVangCoPhep',
      'trangThai',
    ],
    write: [
      'ma',
      'ten',
      'diaChi',
      'nguoiPhuTrachId',
      'truBuoiVangCoPhep',
      'trangThai',
    ],
  },
  coSoQuanLy: {
    read: ['id', 'coSoId', 'userId'],
    write: ['coSoId', 'userId'],
  },
  lop: {
    read: [
      'id',
      'ma',
      'ten',
      'coSoId',
      'hlvId',
      'levelKey',
      'levelOrder',
      'trangThai',
    ],
    write: [
      'ma',
      'ten',
      'coSoId',
      'hlvId',
      'levelKey',
      'levelOrder',
      'trangThai',
    ],
  },
  lopLich: {
    read: ['id', 'lopId', 'thu', 'gioBatDau', 'gioKetThuc'],
    write: ['lopId', 'thu', 'gioBatDau', 'gioKetThuc'],
  },
  hocVien: {
    read: [
      'id',
      'ma',
      'hoTen',
      'namSinh',
      'levelKey',
      'levelOrder',
      'lopId',
      'coSoId',
      'trangThai',
      'ghiChuHlv',
      'soBuoiConLai',
    ],
    // The balance and the level are only changed by the services that keep their history.
    write: [
      'ma',
      'hoTen',
      'namSinh',
      'lopId',
      'coSoId',
      'trangThai',
      'ghiChuHlv',
      'levelKey',
      'levelOrder',
      'soBuoiConLai',
    ],
    // The class and the branch change through `/hocVien/chuyenLop`, which checks both stay in the caller's scope.
    edit: ['hoTen', 'namSinh', 'trangThai', 'ghiChuHlv'],
  },
  lenCap: {
    read: [
      'id',
      'hocVienId',
      'tuLevelKey',
      'denLevelKey',
      'ngay',
      'nguoiXacNhanId',
      'ghiChu',
    ],
    write: [
      'hocVienId',
      'tuLevelKey',
      'denLevelKey',
      'ngay',
      'nguoiXacNhanId',
      'ghiChu',
    ],
  },
  phuHuynh: {
    read: ['id', 'ma', 'hoTen', 'soDienThoai', 'zalo', 'ghiChu'],
    write: ['ma', 'hoTen', 'soDienThoai', 'zalo', 'ghiChu'],
    edit: ['hoTen', 'soDienThoai', 'zalo', 'ghiChu'],
  },
  lienKet: {
    read: ['id', 'hocVienId', 'phuHuynhId', 'quanHe', 'lienHeChinh'],
    write: ['hocVienId', 'phuHuynhId', 'quanHe', 'lienHeChinh'],
  },
  dongY: {
    read: [
      'id',
      'hocVienId',
      'phuHuynhId',
      'mucDich',
      'dongY',
      'treDongY',
      'phienBanDieuKhoan',
      'thoiDiem',
      'kenh',
      'nguoiGhiNhanId',
      'rutLaiLuc',
      'lyDoRut',
    ],
    write: [
      'hocVienId',
      'phuHuynhId',
      'mucDich',
      'dongY',
      'treDongY',
      'phienBanDieuKhoan',
      'thoiDiem',
      'kenh',
      'nguoiGhiNhanId',
      'rutLaiLuc',
      'lyDoRut',
    ],
  },
  buoiHoc: {
    read: [
      'id',
      'lopId',
      'ngay',
      'gioBatDau',
      'gioKetThuc',
      'hlvId',
      'loai',
      'trangThai',
    ],
    write: [
      'lopId',
      'ngay',
      'gioBatDau',
      'gioKetThuc',
      'hlvId',
      'loai',
      'trangThai',
    ],
  },
  diemDanh: {
    read: [
      'id',
      'buoiHocId',
      'hocVienId',
      'trangThai',
      'daLamBtvn',
      'nhanXet',
      'soBuoiDaTru',
      'nguoiDiemDanhId',
    ],
    write: [
      'buoiHocId',
      'hocVienId',
      'trangThai',
      'daLamBtvn',
      'nhanXet',
      'soBuoiDaTru',
      'nguoiDiemDanhId',
    ],
  },
  goiHoc: {
    read: [
      'id',
      'hocVienId',
      'soBuoi',
      'donGia',
      'thanhTien',
      'ngayMua',
      'trangThai',
      'nguoiTaoId',
    ],
    write: [
      'hocVienId',
      'soBuoi',
      'donGia',
      'thanhTien',
      'ngayMua',
      'trangThai',
      'nguoiTaoId',
    ],
  },
  thanhToan: {
    read: [
      'id',
      'goiHocId',
      'hocVienId',
      'coSoId',
      'soTien',
      'hinhThuc',
      'ngay',
      'thang',
      'noiDungCk',
      'nguoiGhiNhanId',
    ],
    write: [
      'goiHocId',
      'hocVienId',
      'coSoId',
      'soTien',
      'hinhThuc',
      'ngay',
      'thang',
      'noiDungCk',
      'nguoiGhiNhanId',
    ],
  },
  nhanXetThang: {
    read: [
      'id',
      'hocVienId',
      'lopId',
      'hlvId',
      'thang',
      'noiDung',
      'trangThai',
    ],
    write: ['hocVienId', 'lopId', 'hlvId', 'thang', 'noiDung', 'trangThai'],
  },
  sach: {
    read: ['id', 'kyHieu', 'ten', 'giaBia', 'giaBan', 'trangThai'],
    write: ['kyHieu', 'ten', 'giaBia', 'giaBan', 'trangThai'],
  },
  phatSach: {
    read: [
      'id',
      'hocVienId',
      'sachId',
      'coSoId',
      'ngay',
      'uuDai',
      'tienSach',
      'ghiChu',
      'nguoiTaoId',
      'createdAt',
    ],
    write: [
      'hocVienId',
      'sachId',
      'coSoId',
      'ngay',
      'uuDai',
      'tienSach',
      'ghiChu',
      'nguoiTaoId',
      'createdAt',
    ],
  },
  sachHoc: {
    read: ['id', 'hocVienId', 'sachId', 'trangThai'],
    write: [],
  },
  hoSoGv: {
    read: ['id', 'userId', 'tenVietTat', 'viTri', 'tinhTrang', 'thuLaoMotBuoi'],
    write: ['userId', 'tenVietTat', 'viTri', 'tinhTrang', 'thuLaoMotBuoi'],
  },
  lienHe: {
    read: [
      'id',
      'hoTen',
      'soDienThoai',
      'coSoId',
      'kenh',
      'trangThai',
      'ngayNhac',
      'ghiChu',
      'ngayTao',
    ],
    write: [
      'hoTen',
      'soDienThoai',
      'coSoId',
      'kenh',
      'trangThai',
      'ngayNhac',
      'ghiChu',
      'ngayTao',
    ],
  },
  xuatDuLieu: {
    read: ['id', 'userId', 'loai', 'soDong', 'createdAt'],
    write: [],
  },
  soDuNhatKy: {
    read: [
      'id',
      'hocVienId',
      'thayDoi',
      'soDuSau',
      'lyDo',
      'goiHocId',
      'diemDanhId',
      'ghiChu',
      'nguoiThucHienId',
      'createdAt',
    ],
    write: [],
  },
} as const;

/** Reads of the two fields below are what other applications get through `/api/ext/*`. */
export const EXT_FIELDS = {
  hocVien: [
    'id',
    'ma',
    'hoTen',
    'levelKey',
    'levelOrder',
    'lopId',
    'trangThai',
  ],
  lop: ['id', 'ma', 'ten'],
  phuHuynh: ['id', 'ma'],
} as const;

type Fields = readonly string[];

function perm(key: CollectionKey, fields: { read: Fields; write?: Fields }) {
  return defineDatabasePermission((p) =>
    p
      .collection(COLLECTIONS[key].name)
      .title(COLLECTIONS[key].title)
      .read([...fields.read]),
  );
}

/** One collection, two actions: view and manage. The scope key is always `data`. */
function simple(
  id: string,
  title: string,
  key: keyof typeof FIELDS,
  options: { create?: boolean; update?: Fields; remove?: boolean },
) {
  const f = FIELDS[key] as { read: Fields; write: Fields };
  const base = perm(key, f);
  return defineCompositeResource(id, (r) =>
    r
      .title(title)
      .action('view', (a) => a.title('Xem').grant('data', base))
      .action('manage', (a) => {
        let manage = base;
        if (options.create) manage = manage.create([...f.write]);
        if (options.update) manage = manage.update([...options.update]);
        if (options.remove) manage = manage.delete();
        return a.title('Quản lý').grant('data', manage);
      }),
  );
}

// A branch is closed by its status, never deleted (it owns classes and students).
export const coSo = simple('edu.coSo', 'Cơ sở', 'coSo', {
  create: true,
  update: FIELDS.coSo.write,
});
// The books a student is learning (`dang_hoc`) or has finished (`da_hoc`), shown on his file. Written by the Lark import
// only; read by whoever sees the student (the record scope is by `hocVienId`).
const sachHocRead = perm('sachHoc', FIELDS.sachHoc);
export const sachHoc = defineCompositeResource('edu.sachHoc', (r) =>
  r
    .title('Sách đã và đang học')
    .action('view', (a) => a.title('Xem').grant('data', sachHocRead)),
);
// Coach profile and pay per session (DS-61 phase F). Pay is the club's private matter: only the administrator holds
// this resource; the account itself (`userId`) cannot be changed after the profile is made.
export const hoSoGv = simple('edu.hoSoGv', 'Hồ sơ giáo viên', 'hoSoGv', {
  create: true,
  update: ['tenVietTat', 'viTri', 'tinhTrang', 'thuLaoMotBuoi'],
});
// Admissions (DS-61 phase D): a family that has not enrolled yet. Minimal data by design: the parent's name and phone,
// the branch, the channel, a status, a reminder day and a short note; no address, no social profile, no child's data.
// A contact is deleted when the club no longer needs it (the retention rule is in `.agents/rules/edu.md`).
export const tuyenSinh = simple('edu.tuyenSinh', 'Tuyển sinh', 'lienHe', {
  create: true,
  update: FIELDS.lienHe.write,
  remove: true,
});
// A book is withdrawn by its status (`ngung`), never deleted: what was handed out points to it.
export const sach = simple('edu.sach', 'Sách', 'sach', {
  create: true,
  update: FIELDS.sach.write,
});
export const coSoQuanLy = simple(
  'edu.coSoQuanLy',
  'Người quản lý cơ sở',
  'coSoQuanLy',
  {
    create: true,
    update: ['coSoId', 'userId'],
    remove: true,
  },
);
// A class is closed by its status, never deleted (it owns students, timetable rows and sessions).
export const lop = simple('edu.lop', 'Lớp', 'lop', {
  create: true,
  update: FIELDS.lop.write,
});
export const lopLich = simple('edu.lopLich', 'Lịch học của lớp', 'lopLich', {
  create: true,
  update: FIELDS.lopLich.write,
  remove: true,
});
export const phuHuynh = simple('edu.phuHuynh', 'Phụ huynh', 'phuHuynh', {
  create: true,
  update: FIELDS.phuHuynh.edit,
});
export const lienKet = simple(
  'edu.lienKet',
  'Phụ huynh của học viên',
  'lienKet',
  {
    // Links are created by `/phuHuynh/taoMoi` only, which checks the parent is one the caller may see.
    update: ['quanHe', 'lienHeChinh'],
    remove: true,
  },
);

const hocVienRead = perm('hocVien', FIELDS.hocVien);
const lenCapRead = perm('lenCap', FIELDS.lenCap);
const dongYRead = perm('dongY', FIELDS.dongY);

/** Student: view, manage (create + edit profile), updateNote (a coach edits only the note), levelUp (confirm a level), import (CSV). */
export const hocVien = defineCompositeResource('edu.hocVien', (r) =>
  r
    .title('Học viên')
    .action('view', (a) => a.title('Xem').grant('data', hocVienRead))
    .action('manage', (a) =>
      a
        .title('Thêm và sửa hồ sơ')
        .grant(
          'data',
          hocVienRead
            .create([...FIELDS.hocVien.write])
            .update([...FIELDS.hocVien.edit]),
        ),
    )
    .action('updateNote', (a) =>
      a
        .title('Sửa ghi chú HLV')
        .grant('data', hocVienRead.update(['ghiChuHlv'])),
    )
    .action('levelUp', (a) =>
      a
        .title('Xác nhận lên cấp')
        .grant('data', hocVienRead.update(['levelKey', 'levelOrder']))
        .grant('history', lenCapRead.create([...FIELDS.lenCap.write])),
    )
    // Bulk import from a CSV file (DS-60). The route reads the branches and classes the caller may see through the
    // `branches` and `classes` scopes and refuses a row that targets any other; students, parents and their links
    // are written through `data`; `parents` lets it reuse a parent the caller already sees (parents and links are created
    // by the route after it has checked the student is in scope, as `/phuHuynh/taoMoi` does).
    .action('import', (a) =>
      a
        .title('Nhập học viên và phụ huynh từ tệp CSV')
        .grant('data', hocVienRead.create([...FIELDS.hocVien.write]))
        .grant('branches', perm('coSo', { read: FIELDS.coSo.read }))
        .grant('classes', perm('lop', { read: FIELDS.lop.read }))
        .grant('parents', perm('phuHuynh', FIELDS.phuHuynh)),
    )
    // Export to a CSV file (DS-60): read-only over the same collections, through the caller's own scope. The route
    // reads students, their branch and class codes, and their parents and links; it writes only the export log.
    .action('export', (a) =>
      a
        .title('Xuất học viên và phụ huynh ra tệp CSV')
        .grant('data', hocVienRead)
        .grant('branches', perm('coSo', { read: FIELDS.coSo.read }))
        .grant('classes', perm('lop', { read: FIELDS.lop.read }))
        .grant('parents', perm('phuHuynh', FIELDS.phuHuynh))
        .grant('links', perm('lienKet', FIELDS.lienKet)),
    ),
);

/** Consent records: view, and record (create a consent, or set the withdrawal fields). */
export const dongY = defineCompositeResource('edu.dongY', (r) =>
  r
    .title('Đồng ý của phụ huynh')
    .action('view', (a) => a.title('Xem').grant('data', dongYRead))
    .action('record', (a) =>
      a
        .title('Ghi nhận và rút lại')
        .grant(
          'data',
          dongYRead
            .create([...FIELDS.dongY.write])
            .update(['rutLaiLuc', 'lyDoRut']),
        ),
    ),
);

/** What other applications may read. Reachable only through `/api/ext/*`. */
export const ext = defineCompositeResource('edu.ext', (r) =>
  r
    .title('API chỉ đọc cho ứng dụng khác')
    .action('readStudents', (a) =>
      a
        .title('Đọc học viên')
        .grant('student', perm('hocVien', { read: EXT_FIELDS.hocVien }))
        .grant('class', perm('lop', { read: EXT_FIELDS.lop })),
    )
    .action('readParents', (a) =>
      a
        .title('Đọc phụ huynh')
        .grant('parent', perm('phuHuynh', { read: EXT_FIELDS.phuHuynh })),
    ),
);

const buoiHocRead = perm('buoiHoc', FIELDS.buoiHoc);
const diemDanhRead = perm('diemDanh', FIELDS.diemDanh);
const goiHocRead = perm('goiHoc', FIELDS.goiHoc);
const thanhToanRead = perm('thanhToan', FIELDS.thanhToan);
const soDuRead = perm('soDuNhatKy', FIELDS.soDuNhatKy);

/** Sessions: view, and manage (generate the sessions of a class from its timetable). */
export const buoiHoc = defineCompositeResource('edu.buoiHoc', (r) =>
  r
    .title('Buổi học')
    .action('view', (a) => a.title('Xem').grant('data', buoiHocRead))
    .action('manage', (a) =>
      a
        .title('Tạo buổi theo lịch lớp')
        .grant('data', buoiHocRead.create([...FIELDS.buoiHoc.write])),
    ),
);

/** Attendance: view, and record (take the register of a session; the balance is changed by the service). */
export const diemDanh = defineCompositeResource('edu.diemDanh', (r) =>
  r
    .title('Điểm danh')
    .action('view', (a) => a.title('Xem').grant('data', diemDanhRead))
    .action('record', (a) =>
      a
        .title('Điểm danh')
        .grant(
          'data',
          diemDanhRead
            .create([...FIELDS.diemDanh.write])
            .update([
              'trangThai',
              'daLamBtvn',
              'nhanXet',
              'soBuoiDaTru',
              'nguoiDiemDanhId',
            ]),
        ),
    ),
);

/** Packages of sessions: view, and manage (sell). A package is never edited; a coach holds neither action. */
export const goiHoc = defineCompositeResource('edu.goiHoc', (r) =>
  r
    .title('Gói buổi')
    .action('view', (a) => a.title('Xem').grant('data', goiHocRead))
    .action('manage', (a) =>
      a
        .title('Bán gói buổi')
        .grant('data', goiHocRead.create([...FIELDS.goiHoc.write])),
    ),
);

/** Payments: view, and manage (record). A payment is never edited or deleted here. */
export const thanhToan = defineCompositeResource('edu.thanhToan', (r) =>
  r
    .title('Thanh toán')
    .action('view', (a) => a.title('Xem').grant('data', thanhToanRead))
    .action('manage', (a) =>
      a
        .title('Ghi nhận thanh toán')
        .grant('data', thanhToanRead.create([...FIELDS.thanhToan.write])),
    ),
);

const phatSachRead = perm('phatSach', FIELDS.phatSach);

/** Books handed out: view, and manage (hand a book out; a handout is never edited or deleted here). */
export const phatSach = defineCompositeResource('edu.phatSach', (r) =>
  r
    .title('Phát sách')
    .action('view', (a) => a.title('Xem').grant('data', phatSachRead))
    .action('manage', (a) =>
      a
        .title('Phát sách cho học viên')
        .grant('data', phatSachRead.create([...FIELDS.phatSach.write])),
    ),
);

/** The balance ledger of a student. Rows are written only by the services that change a balance. */
export const soDu = defineCompositeResource('edu.soDu', (r) =>
  r
    .title('Nhật ký số dư buổi')
    .action('view', (a) => a.title('Xem').grant('data', soDuRead)),
);

const nhanXetRead = perm('nhanXetThang', FIELDS.nhanXetThang);

/** Monthly comments: view (and export as text), and write (a coach writes the comment of a student of their class). */
export const nhanXet = defineCompositeResource('edu.nhanXet', (r) =>
  r
    .title('Nhận xét tháng')
    .action('view', (a) =>
      a.title('Xem và xuất văn bản').grant('data', nhanXetRead),
    )
    .action('write', (a) =>
      a
        .title('Viết nhận xét')
        .grant(
          'data',
          nhanXetRead
            .create([...FIELDS.nhanXetThang.write])
            .update(['noiDung', 'trangThai']),
        ),
    ),
);

/**
 * Exporting a report as a file is its own action (knowledge document 05): holding `view` of a report does not allow
 * downloading it. The grant is over the export log, the record of every export; the route checks the action itself.
 */
export const baoCao = defineCompositeResource('edu.baoCao', (r) =>
  r
    .title('Báo cáo')
    .action('export', (a) =>
      a
        .title('Xuất báo cáo ra tệp CSV')
        .grant('data', perm('xuatDuLieu', FIELDS.xuatDuLieu)),
    ),
);
