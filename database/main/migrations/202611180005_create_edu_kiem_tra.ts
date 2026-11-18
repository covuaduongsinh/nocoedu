import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The tests of a level (GĐ 5 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`): a test of one level for one class, the
 * skills it covers and the mark of each student on each skill.
 *
 * - `eduBaiKiemTra`: a test. `loai` is `dinh_ky` (a periodic check) or `len_cap` (the test a student passes to be
 *   proposed for the next level), `levelKey` the level it tests (one of `server/edu/levels.ts`), `lopId` and `coSoId`
 *   the class and its branch, `ngay` the day (`YYYY-MM-DD`), `diemDat` the pass mark as a whole percentage.
 *   `trangThai` is `nhap` (marks may be entered, the test may still be edited while it has none) or `da_chot` (closed:
 *   nothing changes any more). `chotLuc` is when it was closed.
 * - `eduBaiKiemTraKyNang`: a skill the test covers and its top mark. A skill appears once per test.
 * - `eduKetQuaKiemTra`: the whole-number mark of one student on one skill of one test (one row per triple). A student
 *   who was not tested has no row.
 *
 * Nothing is deleted by the application: closing a test writes `eduHocVienKyNang` (`nguon = kiem_tra`) and the rows stay
 * as the record of it. Written out literally: a migration is immutable history and imports nothing.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611180005_create_edu_kiem_tra',

  async up({ builder }) {
    await builder.createCollection('eduBaiKiemTra', (c) => {
      c.increments('id');
      c.string('ten', { length: 200, nullable: false });
      c.string('loai', { length: 16, nullable: false });
      c.string('levelKey', { length: 16, nullable: false });
      c.integer('lopId', { nullable: false });
      c.integer('coSoId', { nullable: false });
      c.string('ngay', { length: 10, nullable: false });
      c.integer('diemDat', { nullable: false });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'nhap',
      });
      c.string('nguoiTaoId', { length: 64, nullable: true });
      c.datetime('chotLuc', { nullable: true });
      c.datetime('createdAt', { nullable: false });
      c.foreignKey('lopId', {
        references: { collection: 'eduLop', fields: ['id'] },
        name: 'fk_edu_bai_kiem_tra_lop',
      });
      c.foreignKey('coSoId', {
        references: { collection: 'eduCoSo', fields: ['id'] },
        name: 'fk_edu_bai_kiem_tra_co_so',
      });
      c.index('lopId', { name: 'ix_edu_bai_kiem_tra_lop' });
      c.index('coSoId', { name: 'ix_edu_bai_kiem_tra_co_so' });
    });

    await builder.createCollection('eduBaiKiemTraKyNang', (c) => {
      c.increments('id');
      c.integer('baiKiemTraId', { nullable: false });
      c.integer('kyNangId', { nullable: false });
      c.integer('diemToiDa', { nullable: false });
      c.foreignKey('baiKiemTraId', {
        references: { collection: 'eduBaiKiemTra', fields: ['id'] },
        name: 'fk_edu_bai_kiem_tra_ky_nang_bai',
      });
      c.foreignKey('kyNangId', {
        references: { collection: 'eduKyNang', fields: ['id'] },
        name: 'fk_edu_bai_kiem_tra_ky_nang_ky_nang',
      });
      c.unique(['baiKiemTraId', 'kyNangId'], {
        name: 'uq_edu_bai_kiem_tra_ky_nang',
      });
      c.index('kyNangId', { name: 'ix_edu_bai_kiem_tra_ky_nang_ky_nang' });
    });

    await builder.createCollection('eduKetQuaKiemTra', (c) => {
      c.increments('id');
      c.integer('baiKiemTraId', { nullable: false });
      c.integer('hocVienId', { nullable: false });
      c.integer('kyNangId', { nullable: false });
      c.integer('diem', { nullable: false });
      c.string('nguoiNhapId', { length: 64, nullable: true });
      c.datetime('capNhatLuc', { nullable: false });
      c.foreignKey('baiKiemTraId', {
        references: { collection: 'eduBaiKiemTra', fields: ['id'] },
        name: 'fk_edu_ket_qua_kiem_tra_bai',
      });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_ket_qua_kiem_tra_hoc_vien',
      });
      c.foreignKey('kyNangId', {
        references: { collection: 'eduKyNang', fields: ['id'] },
        name: 'fk_edu_ket_qua_kiem_tra_ky_nang',
      });
      c.unique(['baiKiemTraId', 'hocVienId', 'kyNangId'], {
        name: 'uq_edu_ket_qua_kiem_tra',
      });
      c.index('hocVienId', { name: 'ix_edu_ket_qua_kiem_tra_hoc_vien' });
      c.index('kyNangId', { name: 'ix_edu_ket_qua_kiem_tra_ky_nang' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduKetQuaKiemTra');
    await builder.dropCollection('eduBaiKiemTraKyNang');
    await builder.dropCollection('eduBaiKiemTra');
  },
});

export default migration;
