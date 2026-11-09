import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * NocoEdu phase 1 schema: branches, classes, students, parents, consents, sessions, attendance, tuition and the
 * balance ledger. Dates are stored as text (`YYYY-MM-DD`), times as `HH:mm` and months as `YYYY-MM`, so no query needs
 * a dialect-specific date function and no value shifts with a time zone. Booleans are written `true`/`false`.
 *
 * Student and parent contact data is personal data of children and families: only what the club needs is stored (the
 * birth year, never a full date of birth; no photo, school or home address).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611090001_create_edu_tables',

  async up({ builder }) {
    await builder.createCollection('eduCoSo', (c) => {
      c.increments('id');
      c.string('ma', { length: 32, nullable: false });
      c.string('ten', { length: 191, nullable: false });
      c.string('diaChi', { length: 255, nullable: true });
      c.string('nguoiPhuTrachId', { length: 64, nullable: true });
      // true: an excused absence still uses up one session at this branch.
      c.boolean('truBuoiVangCoPhep', { nullable: false, defaultValue: false });
      c.string('trangThai', {
        length: 32,
        nullable: false,
        defaultValue: 'hoat_dong',
      });
      c.unique('ma', { name: 'uq_edu_co_so_ma' });
    });

    await builder.createCollection('eduCoSoQuanLy', (c) => {
      c.increments('id');
      c.integer('coSoId', { nullable: false });
      c.string('userId', { length: 64, nullable: false });
      c.foreignKey('coSoId', {
        references: { collection: 'eduCoSo', fields: ['id'] },
        name: 'fk_edu_co_so_quan_ly_co_so',
      });
      c.unique(['coSoId', 'userId'], { name: 'uq_edu_co_so_quan_ly_cap' });
    });

    await builder.createCollection('eduLop', (c) => {
      c.increments('id');
      c.string('ma', { length: 32, nullable: false });
      c.string('ten', { length: 191, nullable: false });
      c.integer('coSoId', { nullable: false });
      c.string('hlvId', { length: 64, nullable: true });
      c.string('levelKey', { length: 16, nullable: false });
      c.integer('levelOrder', { nullable: false });
      c.string('trangThai', {
        length: 32,
        nullable: false,
        defaultValue: 'dang_mo',
      });
      c.foreignKey('coSoId', {
        references: { collection: 'eduCoSo', fields: ['id'] },
        name: 'fk_edu_lop_co_so',
      });
      c.unique('ma', { name: 'uq_edu_lop_ma' });
      c.index('coSoId', { name: 'ix_edu_lop_co_so' });
      c.index('hlvId', { name: 'ix_edu_lop_hlv' });
    });

    await builder.createCollection('eduLopLich', (c) => {
      c.increments('id');
      c.integer('lopId', { nullable: false });
      c.integer('thu', { nullable: false });
      c.string('gioBatDau', { length: 5, nullable: false });
      c.string('gioKetThuc', { length: 5, nullable: false });
      c.foreignKey('lopId', {
        references: { collection: 'eduLop', fields: ['id'] },
        name: 'fk_edu_lop_lich_lop',
      });
      c.index('lopId', { name: 'ix_edu_lop_lich_lop' });
    });

    await builder.createCollection('eduHocVien', (c) => {
      c.increments('id');
      c.string('ma', { length: 32, nullable: false });
      c.string('hoTen', { length: 191, nullable: false });
      c.integer('namSinh', { nullable: false });
      c.string('levelKey', { length: 16, nullable: false });
      c.integer('levelOrder', { nullable: false });
      c.integer('lopId', { nullable: true });
      c.integer('coSoId', { nullable: false });
      c.string('trangThai', {
        length: 32,
        nullable: false,
        defaultValue: 'dang_hoc',
      });
      c.text('ghiChuHlv', { nullable: true });
      c.integer('soBuoiConLai', { nullable: false, defaultValue: 0 });
      c.foreignKey('lopId', {
        references: { collection: 'eduLop', fields: ['id'] },
        name: 'fk_edu_hoc_vien_lop',
      });
      c.foreignKey('coSoId', {
        references: { collection: 'eduCoSo', fields: ['id'] },
        name: 'fk_edu_hoc_vien_co_so',
      });
      c.unique('ma', { name: 'uq_edu_hoc_vien_ma' });
      c.index('lopId', { name: 'ix_edu_hoc_vien_lop' });
      c.index('coSoId', { name: 'ix_edu_hoc_vien_co_so' });
    });

    await builder.createCollection('eduHocVienLenCap', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.string('tuLevelKey', { length: 16, nullable: true });
      c.string('denLevelKey', { length: 16, nullable: false });
      c.string('ngay', { length: 10, nullable: false });
      c.string('nguoiXacNhanId', { length: 64, nullable: false });
      c.text('ghiChu', { nullable: true });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_len_cap_hoc_vien',
      });
      c.index('hocVienId', { name: 'ix_edu_len_cap_hoc_vien' });
    });

    await builder.createCollection('eduPhuHuynh', (c) => {
      c.increments('id');
      c.string('ma', { length: 32, nullable: false });
      c.string('hoTen', { length: 191, nullable: false });
      c.string('soDienThoai', { length: 20, nullable: false });
      c.string('zalo', { length: 64, nullable: true });
      c.text('ghiChu', { nullable: true });
      c.unique('ma', { name: 'uq_edu_phu_huynh_ma' });
      c.index('soDienThoai', { name: 'ix_edu_phu_huynh_sdt' });
    });

    await builder.createCollection('eduHocVienPhuHuynh', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('phuHuynhId', { nullable: false });
      c.string('quanHe', { length: 32, nullable: false });
      c.boolean('lienHeChinh', { nullable: false, defaultValue: false });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_hv_ph_hoc_vien',
      });
      c.foreignKey('phuHuynhId', {
        references: { collection: 'eduPhuHuynh', fields: ['id'] },
        name: 'fk_edu_hv_ph_phu_huynh',
      });
      c.unique(['hocVienId', 'phuHuynhId'], { name: 'uq_edu_hv_ph_cap' });
    });

    // Append-only: a withdrawal sets rutLaiLuc, a row is never deleted.
    await builder.createCollection('eduDongY', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('phuHuynhId', { nullable: false });
      c.string('mucDich', { length: 32, nullable: false });
      c.boolean('dongY', { nullable: false });
      c.boolean('treDongY', { nullable: false, defaultValue: false });
      c.string('phienBanDieuKhoan', { length: 32, nullable: false });
      c.datetime('thoiDiem', { nullable: false });
      c.string('kenh', { length: 16, nullable: false });
      c.string('nguoiGhiNhanId', { length: 64, nullable: false });
      c.datetime('rutLaiLuc', { nullable: true });
      c.text('lyDoRut', { nullable: true });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_dong_y_hoc_vien',
      });
      c.foreignKey('phuHuynhId', {
        references: { collection: 'eduPhuHuynh', fields: ['id'] },
        name: 'fk_edu_dong_y_phu_huynh',
      });
      c.index(['hocVienId', 'mucDich'], { name: 'ix_edu_dong_y_hv_muc_dich' });
    });

    await builder.createCollection('eduBuoiHoc', (c) => {
      c.increments('id');
      c.integer('lopId', { nullable: false });
      c.string('ngay', { length: 10, nullable: false });
      c.string('gioBatDau', { length: 5, nullable: false });
      c.string('gioKetThuc', { length: 5, nullable: false });
      c.string('hlvId', { length: 64, nullable: true });
      c.string('loai', { length: 16, nullable: false, defaultValue: 'thuong' });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'du_kien',
      });
      c.foreignKey('lopId', {
        references: { collection: 'eduLop', fields: ['id'] },
        name: 'fk_edu_buoi_hoc_lop',
      });
      c.unique(['lopId', 'ngay', 'gioBatDau'], {
        name: 'uq_edu_buoi_hoc_lop_ngay_gio',
      });
      c.index('ngay', { name: 'ix_edu_buoi_hoc_ngay' });
    });

    await builder.createCollection('eduDiemDanh', (c) => {
      c.increments('id');
      c.integer('buoiHocId', { nullable: false });
      c.integer('hocVienId', { nullable: false });
      c.string('trangThai', { length: 32, nullable: false });
      c.boolean('daLamBtvn', { nullable: false, defaultValue: false });
      c.string('nhanXet', { length: 500, nullable: true });
      // Sessions already deducted for this row; the next save writes only the difference.
      c.integer('soBuoiDaTru', { nullable: false, defaultValue: 0 });
      c.string('nguoiDiemDanhId', { length: 64, nullable: true });
      c.foreignKey('buoiHocId', {
        references: { collection: 'eduBuoiHoc', fields: ['id'] },
        name: 'fk_edu_diem_danh_buoi_hoc',
      });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_diem_danh_hoc_vien',
      });
      c.unique(['buoiHocId', 'hocVienId'], { name: 'uq_edu_diem_danh_cap' });
    });

    await builder.createCollection('eduGoiHoc', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('soBuoi', { nullable: false });
      c.integer('donGia', { nullable: false });
      c.integer('thanhTien', { nullable: false });
      c.string('ngayMua', { length: 10, nullable: false });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'hieu_luc',
      });
      c.string('nguoiTaoId', { length: 64, nullable: false });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_goi_hoc_hoc_vien',
      });
      c.index('hocVienId', { name: 'ix_edu_goi_hoc_hoc_vien' });
    });

    await builder.createCollection('eduThanhToan', (c) => {
      c.increments('id');
      c.integer('goiHocId', { nullable: false });
      c.integer('hocVienId', { nullable: false });
      c.integer('coSoId', { nullable: false });
      c.integer('soTien', { nullable: false });
      c.string('hinhThuc', { length: 16, nullable: false });
      c.string('ngay', { length: 10, nullable: false });
      c.string('thang', { length: 7, nullable: false });
      c.string('noiDungCk', { length: 191, nullable: true });
      c.string('nguoiGhiNhanId', { length: 64, nullable: false });
      c.foreignKey('goiHocId', {
        references: { collection: 'eduGoiHoc', fields: ['id'] },
        name: 'fk_edu_thanh_toan_goi_hoc',
      });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_thanh_toan_hoc_vien',
      });
      c.foreignKey('coSoId', {
        references: { collection: 'eduCoSo', fields: ['id'] },
        name: 'fk_edu_thanh_toan_co_so',
      });
      c.index(['thang', 'coSoId'], { name: 'ix_edu_thanh_toan_thang_co_so' });
    });

    // Append-only ledger of every change to a student's balance.
    await builder.createCollection('eduSoDuNhatKy', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('thayDoi', { nullable: false });
      c.integer('soDuSau', { nullable: false });
      c.string('lyDo', { length: 32, nullable: false });
      c.integer('goiHocId', { nullable: true });
      c.integer('diemDanhId', { nullable: true });
      c.text('ghiChu', { nullable: true });
      c.string('nguoiThucHienId', { length: 64, nullable: true });
      c.datetime('createdAt', { nullable: false });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_so_du_hoc_vien',
      });
      c.index('hocVienId', { name: 'ix_edu_so_du_hoc_vien' });
    });

    await builder.createCollection('eduNhanXetThang', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('lopId', { nullable: false });
      c.string('hlvId', { length: 64, nullable: false });
      c.string('thang', { length: 7, nullable: false });
      c.text('noiDung', { nullable: false });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'nhap',
      });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_nhan_xet_hoc_vien',
      });
      c.foreignKey('lopId', {
        references: { collection: 'eduLop', fields: ['id'] },
        name: 'fk_edu_nhan_xet_lop',
      });
      c.unique(['hocVienId', 'thang', 'hlvId'], {
        name: 'uq_edu_nhan_xet_hv_thang_hlv',
      });
    });

    // Who exported which student list, when and how many rows (child-data protection rule).
    await builder.createCollection('eduXuatDuLieuNhatKy', (c) => {
      c.increments('id');
      c.string('userId', { length: 64, nullable: false });
      c.string('loai', { length: 32, nullable: false });
      c.json('boLoc', { nullable: true });
      c.integer('soDong', { nullable: false });
      c.datetime('createdAt', { nullable: false });
    });
  },

  async down({ builder }) {
    for (const name of [
      'eduXuatDuLieuNhatKy',
      'eduNhanXetThang',
      'eduSoDuNhatKy',
      'eduThanhToan',
      'eduGoiHoc',
      'eduDiemDanh',
      'eduBuoiHoc',
      'eduDongY',
      'eduHocVienPhuHuynh',
      'eduPhuHuynh',
      'eduHocVienLenCap',
      'eduHocVien',
      'eduLopLich',
      'eduLop',
      'eduCoSoQuanLy',
      'eduCoSo',
    ]) {
      await builder.dropCollection(name);
    }
  },
});

export default migration;
