import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The books a student is learning (`dang_hoc`) or has finished (`da_hoc`), shown on his file (DS-61 phase E4). One row per
 * student and book (a book is in one of the two states). Written by the Lark import (`externalId`); the application only
 * reads it.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140007_create_edu_sach_hoc',

  async up({ builder }) {
    await builder.createCollection('eduSachHoc', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('sachId', { nullable: false });
      c.string('trangThai', { length: 16, nullable: false });
      c.string('externalId', { length: 96, nullable: true });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_sach_hoc_hoc_vien',
      });
      c.foreignKey('sachId', {
        references: { collection: 'eduSach', fields: ['id'] },
        name: 'fk_edu_sach_hoc_sach',
      });
      c.unique(['hocVienId', 'sachId'], { name: 'uq_edu_sach_hoc_hoc_vien_sach' });
      c.unique('externalId', { name: 'uq_edu_sach_hoc_external_id' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduSachHoc');
  },
});

export default migration;
