import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Skill groups inside a class (phase 3 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`).
 *
 * - `eduLopNhom`: the groups of a class (`ten`, `thuTu`, `trangThai` = `hoat_dong` or `an`). A group is hidden, never
 *   deleted, so the history below keeps pointing at it. A name is unique within its class.
 * - `eduHocVien.nhomId`: the group a student sits in (nullable: a student may be in none). It changes only through
 *   `POST /hocVien/chuyenNhom`, and `POST /hocVien/chuyenLop` resets it.
 * - `eduHocVienChuyenNhom`: append-only history of the moves (`tuNhomId` null = he had no group, `denNhomId` null = he
 *   left the groups).
 *
 * The migration also gives every class that exists the three standard groups. The names are written out here (this file
 * must not depend on application code that may change later).
 */
const DEFAULT_GROUPS = ['Nhập môn', 'Cơ bản', 'Nâng cao'] as const;

const migration: MigrationDefinition = defineMigration({
  name: '202611180002_edu_lop_nhom',

  async up({ builder, query }) {
    await builder.createCollection('eduLopNhom', (c) => {
      c.increments('id');
      c.integer('lopId', { nullable: false });
      c.string('ten', { length: 100, nullable: false });
      c.integer('thuTu', { nullable: false, defaultValue: 0 });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'hoat_dong',
      });
      c.foreignKey('lopId', {
        references: { collection: 'eduLop', fields: ['id'] },
        name: 'fk_edu_lop_nhom_lop',
      });
      c.unique(['lopId', 'ten'], { name: 'uq_edu_lop_nhom_lop_ten' });
    });

    await builder.alterCollection('eduHocVien', (c) => {
      c.integer('nhomId', { nullable: true });
      c.foreignKey('nhomId', {
        references: { collection: 'eduLopNhom', fields: ['id'] },
        name: 'fk_edu_hoc_vien_nhom',
      });
      c.index('nhomId', { name: 'ix_edu_hoc_vien_nhom' });
    });

    await builder.createCollection('eduHocVienChuyenNhom', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('tuNhomId', { nullable: true });
      c.integer('denNhomId', { nullable: true });
      c.string('ngay', { length: 10, nullable: false });
      c.string('nguoiThucHienId', { length: 64, nullable: false });
      c.text('ghiChu', { nullable: true });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_chuyen_nhom_hoc_vien',
      });
      c.foreignKey('tuNhomId', {
        references: { collection: 'eduLopNhom', fields: ['id'] },
        name: 'fk_edu_chuyen_nhom_tu',
      });
      c.foreignKey('denNhomId', {
        references: { collection: 'eduLopNhom', fields: ['id'] },
        name: 'fk_edu_chuyen_nhom_den',
      });
      c.index('hocVienId', { name: 'ix_edu_chuyen_nhom_hoc_vien' });
    });

    const classes = await query
      .selectFrom('eduLop')
      .select('id')
      .orderBy('id')
      .execute();
    for (const lop of classes) {
      await query
        .insertInto('eduLopNhom')
        .values(
          DEFAULT_GROUPS.map((ten, index) => ({
            lopId: Number(lop.id),
            ten,
            thuTu: index + 1,
            trangThai: 'hoat_dong',
          })),
        )
        .execute();
    }
  },

  async down({ builder }) {
    await builder.dropCollection('eduHocVienChuyenNhom');
    await builder.alterCollection('eduHocVien', (c) => {
      c.dropField('nhomId');
    });
    await builder.dropCollection('eduLopNhom');
  },
});

export default migration;
