import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The knowledge system (GĐ 4 of `docs/plans/2026-11-17-tai-cau-truc-nocoedu.md`): the curriculum, what was taught in a
 * session, and what each student has learned. The six levels are not a table: they come from `server/edu/levels.ts`
 * and `eduChuDe.levelKey` holds the key. No topic or skill is seeded: the head coach loads them from a CSV file.
 *
 * - `eduChuDe`: a topic of one level. `ma` is the stable code the CSV import matches on. Hidden (`an`), never deleted:
 *   skills, sessions and gradings point at it.
 * - `eduKyNang`: the smallest unit of knowledge, a skill or lesson of one topic, optionally tied to a book (`sachId`).
 * - `eduBuoiHocKyNang`: a skill taught in a session, for the whole class (`nhomId` null) or for one group of it. The
 *   same skill is not listed twice for one session and group; the database cannot say it for a null group, so the
 *   route that writes it replaces the whole set in one transaction.
 * - `eduHocVienKyNang`: the state of one student on one skill now, one row per pair. `mucDo` is `da_hoc` (taught while
 *   the student was present: written by the register), `chua_vung`, `dat` or `vung` (graded by hand); `nguon` says which.
 *   "No row" means the student has not learned the skill. A gap is never stored: it is worked out when it is read.
 *
 * Written out literally: a migration is immutable history and imports nothing.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611180004_create_edu_kien_thuc',

  async up({ builder }) {
    await builder.createCollection('eduChuDe', (c) => {
      c.increments('id');
      c.string('levelKey', { length: 16, nullable: false });
      c.string('ma', { length: 40, nullable: false });
      c.string('ten', { length: 200, nullable: false });
      c.integer('thuTu', { nullable: false, defaultValue: 0 });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'hoat_dong',
      });
      c.unique('ma', { name: 'uq_edu_chu_de_ma' });
      c.index('levelKey', { name: 'ix_edu_chu_de_level' });
    });

    await builder.createCollection('eduKyNang', (c) => {
      c.increments('id');
      c.integer('chuDeId', { nullable: false });
      c.string('ma', { length: 40, nullable: false });
      c.string('ten', { length: 200, nullable: false });
      c.string('moTa', { length: 1000, nullable: true });
      c.integer('thuTu', { nullable: false, defaultValue: 0 });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'hoat_dong',
      });
      c.integer('sachId', { nullable: true });
      c.foreignKey('chuDeId', {
        references: { collection: 'eduChuDe', fields: ['id'] },
        name: 'fk_edu_ky_nang_chu_de',
      });
      c.foreignKey('sachId', {
        references: { collection: 'eduSach', fields: ['id'] },
        name: 'fk_edu_ky_nang_sach',
      });
      c.unique('ma', { name: 'uq_edu_ky_nang_ma' });
      c.index('chuDeId', { name: 'ix_edu_ky_nang_chu_de' });
    });

    await builder.createCollection('eduBuoiHocKyNang', (c) => {
      c.increments('id');
      c.integer('buoiHocId', { nullable: false });
      c.integer('lopId', { nullable: false });
      c.integer('kyNangId', { nullable: false });
      c.integer('nhomId', { nullable: true });
      c.foreignKey('buoiHocId', {
        references: { collection: 'eduBuoiHoc', fields: ['id'] },
        name: 'fk_edu_buoi_ky_nang_buoi',
      });
      c.foreignKey('lopId', {
        references: { collection: 'eduLop', fields: ['id'] },
        name: 'fk_edu_buoi_ky_nang_lop',
      });
      c.foreignKey('kyNangId', {
        references: { collection: 'eduKyNang', fields: ['id'] },
        name: 'fk_edu_buoi_ky_nang_ky_nang',
      });
      c.foreignKey('nhomId', {
        references: { collection: 'eduLopNhom', fields: ['id'] },
        name: 'fk_edu_buoi_ky_nang_nhom',
      });
      c.unique(['buoiHocId', 'kyNangId', 'nhomId'], {
        name: 'uq_edu_buoi_ky_nang',
      });
      c.index('kyNangId', { name: 'ix_edu_buoi_ky_nang_ky_nang' });
      c.index('lopId', { name: 'ix_edu_buoi_ky_nang_lop' });
    });

    await builder.createCollection('eduHocVienKyNang', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('kyNangId', { nullable: false });
      c.string('mucDo', { length: 16, nullable: false });
      c.string('nguon', { length: 16, nullable: false });
      c.integer('buoiHocId', { nullable: true });
      c.string('nguoiChamId', { length: 64, nullable: true });
      c.datetime('capNhatLuc', { nullable: false });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_hv_ky_nang_hoc_vien',
      });
      c.foreignKey('kyNangId', {
        references: { collection: 'eduKyNang', fields: ['id'] },
        name: 'fk_edu_hv_ky_nang_ky_nang',
      });
      c.foreignKey('buoiHocId', {
        references: { collection: 'eduBuoiHoc', fields: ['id'] },
        name: 'fk_edu_hv_ky_nang_buoi',
      });
      c.unique(['hocVienId', 'kyNangId'], { name: 'uq_edu_hv_ky_nang' });
      c.index('kyNangId', { name: 'ix_edu_hv_ky_nang_ky_nang' });
      c.index('buoiHocId', { name: 'ix_edu_hv_ky_nang_buoi' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduHocVienKyNang');
    await builder.dropCollection('eduBuoiHocKyNang');
    await builder.dropCollection('eduKyNang');
    await builder.dropCollection('eduChuDe');
  },
});

export default migration;
