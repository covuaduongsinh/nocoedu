import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Book money a parent paid for a student (DS-61 phase E3), in dong: the other side of the book fund
 * (`paid - eduPhatSach.tienSach handed out`). `coSoId` is the branch of the student. `externalId` keeps the key of an
 * imported row (`Tổng Deal`.`Tiền sách`).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140003_create_edu_nop_sach',

  async up({ builder }) {
    await builder.createCollection('eduNopSach', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('coSoId', { nullable: false });
      c.string('ngay', { length: 10, nullable: false });
      c.integer('soTien', { nullable: false });
      c.string('nguoiTaoId', { length: 64, nullable: true });
      c.string('externalId', { length: 96, nullable: true });
      c.datetime('createdAt', { nullable: false });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_nop_sach_hoc_vien',
      });
      c.foreignKey('coSoId', {
        references: { collection: 'eduCoSo', fields: ['id'] },
        name: 'fk_edu_nop_sach_co_so',
      });
      c.index(['hocVienId', 'ngay'], { name: 'ix_edu_nop_sach_hoc_vien' });
      c.unique('externalId', { name: 'uq_edu_nop_sach_external_id' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduNopSach');
  },
});

export default migration;
