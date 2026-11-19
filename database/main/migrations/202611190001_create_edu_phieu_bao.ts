import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The log of "the parent was told" (docs/plans/2026-11-19-ke-hoach-phieu-bao-ky-hoc-phi.md, phase 2): one row each time a
 * person marks that the notice of a tuition term was sent to the parent. `goiHocId` is the package of the term the
 * notice was about (`null` for a term that is a manual adjustment), `ngay` the calendar day in Vietnam, `soBuoiConLai`
 * the balance of the student at that moment and `nguoiBaoId` the account that marked it. It holds no name, phone number
 * or message text.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611190001_create_edu_phieu_bao',

  async up({ builder }) {
    await builder.createCollection('eduPhieuBao', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('goiHocId', { nullable: true });
      c.string('ngay', { length: 10, nullable: false });
      c.integer('soBuoiConLai', { nullable: false });
      c.string('nguoiBaoId', { length: 64, nullable: true });
      c.datetime('createdAt', { nullable: false });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_phieu_bao_hoc_vien',
      });
      c.foreignKey('goiHocId', {
        references: { collection: 'eduGoiHoc', fields: ['id'] },
        name: 'fk_edu_phieu_bao_goi_hoc',
      });
      c.index(['hocVienId', 'ngay'], { name: 'ix_edu_phieu_bao_hoc_vien' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduPhieuBao');
  },
});

export default migration;
