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

/** Student: view, manage (create + edit profile), updateNote (a coach edits only the note), levelUp (confirm a level). */
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
