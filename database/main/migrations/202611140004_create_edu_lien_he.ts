import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Admissions (DS-61 phase D): a family that has not enrolled yet. Minimal on purpose: the parent's name and phone, the
 * branch the family would like, how it found the club (`kenh`), where the contact stands (`trangThai`: moi,
 * dang_cham_soc, da_chot, khong_chot), the day to call back (`ngayNhac`, `YYYY-MM-DD`), a short note and the day the
 * contact was made (`ngayTao`, used by the retention rule). No address, no social profile, no data of a child.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140004_create_edu_lien_he',

  async up({ builder }) {
    await builder.createCollection('eduLienHe', (c) => {
      c.increments('id');
      c.string('hoTen', { length: 191, nullable: false });
      c.string('soDienThoai', { length: 20, nullable: true });
      c.integer('coSoId', { nullable: false });
      c.string('kenh', { length: 64, nullable: true });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'moi',
      });
      c.string('ngayNhac', { length: 10, nullable: true });
      c.string('ghiChu', { length: 500, nullable: true });
      c.string('ngayTao', { length: 10, nullable: false });
      c.foreignKey('coSoId', {
        references: { collection: 'eduCoSo', fields: ['id'] },
        name: 'fk_edu_lien_he_co_so',
      });
      c.index(['coSoId', 'trangThai'], { name: 'ix_edu_lien_he_co_so' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduLienHe');
  },
});

export default migration;
