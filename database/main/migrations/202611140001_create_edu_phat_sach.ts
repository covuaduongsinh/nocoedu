import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The books handed out to the students (DS-61 phase E2): one row per book given to one student on one day.
 * `uuDai` is the discount in dong and `tienSach = giaBan of the book - uuDai` at the time of the handout, kept in the
 * row so a later change of the price never rewrites what a parent paid. `coSoId` is the branch of the student (it
 * carries the record scope, like a payment). `externalId` keeps the Lark record id of an imported row.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140001_create_edu_phat_sach',

  async up({ builder }) {
    await builder.createCollection('eduPhatSach', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('sachId', { nullable: false });
      c.integer('coSoId', { nullable: false });
      c.string('ngay', { length: 10, nullable: false });
      c.integer('uuDai', { nullable: false, defaultValue: 0 });
      c.integer('tienSach', { nullable: false, defaultValue: 0 });
      c.string('ghiChu', { length: 500, nullable: true });
      c.string('nguoiTaoId', { length: 64, nullable: true });
      c.string('externalId', { length: 96, nullable: true });
      c.datetime('createdAt', { nullable: false });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_phat_sach_hoc_vien',
      });
      c.foreignKey('sachId', {
        references: { collection: 'eduSach', fields: ['id'] },
        name: 'fk_edu_phat_sach_sach',
      });
      c.foreignKey('coSoId', {
        references: { collection: 'eduCoSo', fields: ['id'] },
        name: 'fk_edu_phat_sach_co_so',
      });
      c.index(['hocVienId', 'ngay'], { name: 'ix_edu_phat_sach_hoc_vien' });
      c.unique('externalId', { name: 'uq_edu_phat_sach_external_id' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduPhatSach');
  },
});

export default migration;
