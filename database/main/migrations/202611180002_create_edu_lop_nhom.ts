import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Groups of level inside a class (GĐ 3 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`).
 *
 * - `eduLopNhom`: a group of one class. Its status is `hoat_dong` or `an` (a group is hidden, never deleted: students
 *   and their history point at it); the name is unique inside the class.
 * - `eduHocVien.nhomId`: the group a student is in now, nullable. It changes only through `POST /hocVien/chuyenNhom`
 *   (and `POST /hocVien/chuyenLop` sets it back to null), never through a record API.
 * - `eduHocVienChuyenNhom`: the history of those moves, append only.
 *
 * Every class that exists gets the three default groups "Nhập môn", "Cơ bản" and "Nâng cao"; no student is placed
 * in one (the head coach sorts them). Written out literally: a migration is immutable history and imports nothing.
 */
const DEFAULT_GROUPS = ['Nhập môn', 'Cơ bản', 'Nâng cao'] as const;

const migration: MigrationDefinition = defineMigration({
  name: '202611180002_create_edu_lop_nhom',

  async up({ builder, query }) {
    await builder.createCollection('eduLopNhom', (c) => {
      c.increments('id');
      c.integer('lopId', { nullable: false });
      c.string('ten', { length: 60, nullable: false });
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
      c.string('nguoiThucHienId', { length: 64, nullable: true });
      c.string('ghiChu', { length: 500, nullable: true });
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

    const classes = await query.selectFrom('eduLop').select('id').execute();
    const rows = classes.flatMap((lop) =>
      DEFAULT_GROUPS.map((ten, index) => ({
        lopId: Number(lop.id),
        ten,
        thuTu: index + 1,
        trangThai: 'hoat_dong',
      })),
    );
    for (let i = 0; i < rows.length; i += 200) {
      await query
        .insertInto('eduLopNhom')
        .values(rows.slice(i, i + 200))
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
