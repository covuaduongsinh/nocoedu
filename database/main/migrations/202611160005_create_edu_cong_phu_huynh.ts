import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The private link a parent opens to read their child's sessions (`/ph#<token>`). One row per link. The token itself is
 * never stored, only its SHA-256 (`tokenHash`, unique): a copy of the database cannot open a link. A link expires on
 * `hanLuc` (90 days after it was made), can be revoked (`thuHoiLuc`) and counts the times it was opened.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611160005_create_edu_cong_phu_huynh',

  async up({ builder }) {
    await builder.createCollection('eduCongPhuHuynh', (c) => {
      c.increments('id');
      c.integer('hocVienId', { nullable: false });
      c.integer('phuHuynhId', { nullable: false });
      c.string('tokenHash', { length: 64, nullable: false });
      c.datetime('hanLuc', { nullable: false });
      c.datetime('thuHoiLuc', { nullable: true });
      c.datetime('xemCuoiLuc', { nullable: true });
      c.integer('soLanXem', { nullable: false, defaultValue: 0 });
      c.string('nguoiTaoId', { length: 64, nullable: false });
      c.datetime('createdAt', { nullable: false });
      c.foreignKey('hocVienId', {
        references: { collection: 'eduHocVien', fields: ['id'] },
        name: 'fk_edu_cong_ph_hoc_vien',
      });
      c.foreignKey('phuHuynhId', {
        references: { collection: 'eduPhuHuynh', fields: ['id'] },
        name: 'fk_edu_cong_ph_phu_huynh',
      });
      c.unique('tokenHash', { name: 'uq_edu_cong_ph_token_hash' });
      c.index(['hocVienId', 'phuHuynhId'], { name: 'ix_edu_cong_ph_hv_ph' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduCongPhuHuynh');
  },
});

export default migration;
