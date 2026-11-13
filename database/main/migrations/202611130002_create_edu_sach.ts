import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The catalogue of books the club sells to its students (DS-61 phase E). A book is identified by its symbol
 * (`kyHieu`, such as `CT1`); the price is what the parent pays (`giaBan`) and the cover price (`giaBia`), in dong.
 * `externalId` keeps the Lark record id of an imported row (nullable, unique, like the other tables).
 * A book is withdrawn by its status, never deleted: the books handed out later point to it.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611130002_create_edu_sach',

  async up({ builder }) {
    await builder.createCollection('eduSach', (c) => {
      c.increments('id');
      c.string('kyHieu', { length: 32, nullable: false });
      c.string('ten', { length: 191, nullable: false });
      c.integer('giaBia', { nullable: false, defaultValue: 0 });
      c.integer('giaBan', { nullable: false, defaultValue: 0 });
      c.string('trangThai', {
        length: 16,
        nullable: false,
        defaultValue: 'dang_ban',
      });
      c.string('externalId', { length: 96, nullable: true });
      c.unique('kyHieu', { name: 'uq_edu_sach_ky_hieu' });
      c.unique('externalId', { name: 'uq_edu_sach_external_id' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduSach');
  },
});

export default migration;
