import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The money of the club's Lark Base (`Tổng Deal (HP + book)`, DS-61 phase B). A payment written by the import keeps the
 * key of the Lark row it came from, so that running the import again never writes it twice. The column is nullable and
 * unique, like `externalId` of the other tables (`202611100001_edu_lark_mapping`): a payment recorded in the
 * application has none. It is not in any permission field list, so no role reads or writes it through the API.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611130001_edu_thanh_toan_external_id',

  async up({ builder }) {
    await builder.alterCollection('eduThanhToan', (c) => {
      c.string('externalId', { length: 96, nullable: true });
      c.unique('externalId', { name: 'uq_edu_thanh_toan_external_id' });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('eduThanhToan', (c) => {
      c.dropConstraint('uq_edu_thanh_toan_external_id');
    });
    await builder.alterCollection('eduThanhToan', (c) => {
      c.dropField('externalId');
    });
  },
});

export default migration;
