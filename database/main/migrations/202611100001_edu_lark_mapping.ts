import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** Tables that keep the id of the record they were imported from (Lark record id or a derived key). */
const EXTERNAL_ID_TABLES = [
  ['eduCoSo', 'uq_edu_co_so_external_id'],
  ['eduLop', 'uq_edu_lop_external_id'],
  ['eduLopLich', 'uq_edu_lop_lich_external_id'],
  ['eduHocVien', 'uq_edu_hoc_vien_external_id'],
  ['eduPhuHuynh', 'uq_edu_phu_huynh_external_id'],
  ['eduGoiHoc', 'uq_edu_goi_hoc_external_id'],
  ['eduBuoiHoc', 'uq_edu_buoi_hoc_external_id'],
  ['eduDiemDanh', 'uq_edu_diem_danh_external_id'],
] as const;

/**
 * Columns the import of the club's Lark data needs (DS-60 phase 2). Everything is added, nothing is changed:
 * - `externalId` on eight tables: the anti-duplicate key of the import. It is nullable and unique, so rows created in
 *   the application (no external id) never collide with each other.
 * - `eduHocVien.externalCode`: the old student code, kept to look a student up on Lark.
 * - `eduPhuHuynh.email`, the content of a session, the mindfulness score of an attendance row (`yThucDiem`: a name such as `diemYThuc` does not survive the column-name conversion).
 * - `eduDiemDanh.tinhVaoSoDu`: `false` for history already contained in the opening balance (see
 *   `docs/lark/anh-xa-nocoedu.md`); such a row never moves the balance, even when its status is corrected later.
 * - `eduGoiHoc.loai` / `ghiChu`: tells an opening package (`chuyen_so_du`) from a sold one (`mua`).
 *
 * None of the new columns is listed in a permission field list, so no role reads or writes them through the API.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611100001_edu_lark_mapping',

  async up({ builder }) {
    for (const [table, indexName] of EXTERNAL_ID_TABLES) {
      await builder.alterCollection(table, (c) => {
        c.string('externalId', { length: 96, nullable: true });
        c.unique('externalId', { name: indexName });
      });
    }
    await builder.alterCollection('eduHocVien', (c) => {
      c.string('externalCode', { length: 32, nullable: true });
    });
    await builder.alterCollection('eduPhuHuynh', (c) => {
      c.string('email', { length: 191, nullable: true });
    });
    await builder.alterCollection('eduBuoiHoc', (c) => {
      c.text('keHoachDay', { nullable: true });
      c.text('kienThucMoi', { nullable: true });
      c.text('giaoBtvn', { nullable: true });
      c.text('keHoachBuoiSau', { nullable: true });
    });
    await builder.alterCollection('eduDiemDanh', (c) => {
      c.integer('yThucDiem', { nullable: true });
    });
    await builder.alterCollection('eduDiemDanh', (c) => {
      c.boolean('tinhVaoSoDu', { nullable: false, defaultValue: true });
    });
    await builder.alterCollection('eduGoiHoc', (c) => {
      c.string('loai', { length: 16, nullable: false, defaultValue: 'mua' });
      c.text('ghiChu', { nullable: true });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('eduGoiHoc', (c) => {
      c.dropField('ghiChu');
      c.dropField('loai');
    });
    await builder.alterCollection('eduDiemDanh', (c) => {
      c.dropField('tinhVaoSoDu');
    });
    await builder.alterCollection('eduDiemDanh', (c) => {
      c.dropField('yThucDiem');
    });
    await builder.alterCollection('eduBuoiHoc', (c) => {
      c.dropField('keHoachBuoiSau');
      c.dropField('giaoBtvn');
      c.dropField('kienThucMoi');
      c.dropField('keHoachDay');
    });
    await builder.alterCollection('eduPhuHuynh', (c) => {
      c.dropField('email');
    });
    await builder.alterCollection('eduHocVien', (c) => {
      c.dropField('externalCode');
    });
    for (const [table, indexName] of [...EXTERNAL_ID_TABLES].reverse()) {
      await builder.alterCollection(table, (c) => {
        c.dropConstraint(indexName);
      });
      await builder.alterCollection(table, (c) => {
        c.dropField('externalId');
      });
    }
  },
});

export default migration;
