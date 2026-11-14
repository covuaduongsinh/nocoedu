import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The profile of a coach and his pay (DS-61 phase F). The coach stays an account (`userId`, one profile per account);
 * the profile only adds what the club needs for pay: a short name, a position, whether he still works, and the pay for
 * one session in dong. Nothing about identity papers, bank accounts, social profiles or family is kept here.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140005_create_edu_ho_so_gv',

  async up({ builder }) {
    await builder.createCollection('eduHoSoGv', (c) => {
      c.increments('id');
      c.string('userId', { length: 64, nullable: false });
      c.string('tenVietTat', { length: 64, nullable: true });
      c.string('viTri', { length: 64, nullable: true });
      c.string('tinhTrang', {
        length: 16,
        nullable: false,
        defaultValue: 'dang_lam',
      });
      c.integer('thuLaoMotBuoi', { nullable: false, defaultValue: 0 });
      c.unique('userId', { name: 'uq_edu_ho_so_gv_user' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('eduHoSoGv');
  },
});

export default migration;
