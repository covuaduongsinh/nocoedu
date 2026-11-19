import { AppCommand, CommandError } from '@nocobase/app-cli';
import { Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

/**
 * `pnpm nocobase app edu nap-hoc-phi [--dry-run | --commit --user <id>]` (in the image: `node dist/cli/index.js app edu
 * nap-hoc-phi …`): loads the tuition history of Lark (`Deal HP` terms and `Tổng Deal` payments) and recomputes the
 * balance of the students concerned, as decided in docs/plans/2026-11-19-ke-hoach-nap-lich-su-hoc-phi.md.
 *
 * - `--dry-run` (the default) writes the correction in a transaction and rolls it back: the report shows the balances
 *   the commit leaves, nothing stays, not even the log.
 * - `--commit` writes in one transaction and records the run in `eduNhapLarkNhatKy` (`tongKet.nguon = nap_hoc_phi`).
 *
 * Lark is read with Node's `fetch` (no `lark-cli` needed) from `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_DOMAIN`. Output
 * holds counts, student codes, Lark record ids and reason codes only.
 */
export default class NapHocPhi extends AppCommand {
  static override summary =
    'Load the tuition terms and payments of Lark and recompute the balances concerned (dry run by default).';
  static override examples = [
    '<%= config.bin %> <%= command.id %> --dry-run',
    '<%= config.bin %> <%= command.id %> --commit --user <user id>',
  ];
  static override flags: {
    'dry-run': Interfaces.BooleanFlag<boolean>;
    commit: Interfaces.BooleanFlag<boolean>;
    user: Interfaces.OptionFlag<string | undefined>;
    'delay-ms': Interfaces.OptionFlag<number>;
  } = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Simulate the write and roll it back (the default).',
    }),
    commit: Flags.boolean({
      default: false,
      description: 'Write in one transaction and log the run.',
    }),
    user: Flags.string({
      description: 'Id of the user who runs it (required with --commit).',
    }),
    'delay-ms': Flags.integer({
      default: 800,
      description: 'Milliseconds to wait between two calls to Lark.',
    }),
  };

  public async run(): Promise<unknown> {
    const { flags } = await this.parse(NapHocPhi);
    const { parseImportOptions, USAGE_ERROR_CODES } =
      await import('../../../server/edu/lark/nhap.js');
    const { createLarkCliSource, LarkImportError } =
      await import('../../../server/edu/lark/nguon.js');
    const { chayNapHocPhi, inBaoCaoHocPhi } =
      await import('../../../server/edu/lark/nap-hoc-phi.js');

    try {
      const options = parseImportOptions({
        dryRun: flags['dry-run'],
        commit: flags.commit,
        user: flags.user,
        delayMs: flags['delay-ms'],
      });
      const source = await createLarkCliSource({
        delayMs: options.delayMs,
        transport: 'fetch',
        log: (line) => this.log(line),
      });
      try {
        const report = await this.withApp(async ({ app }) => {
          app.registerProviders();
          const { databaseManagerToken } = await import('@nocobase/db');
          return chayNapHocPhi(
            app.container.resolve(databaseManagerToken),
            source,
            { commit: options.commit, userId: options.userId },
            (line) => this.log(line),
          );
        });
        for (const line of inBaoCaoHocPhi(report)) this.log(line);
        if (!options.commit) this.setStatus('success-noop');
        return report;
      } finally {
        await source.close();
      }
    } catch (error) {
      if (error instanceof LarkImportError) {
        const usage = USAGE_ERROR_CODES.includes(error.code);
        throw new CommandError(error.message, {
          code: error.code,
          ...(usage ? { exit: 2 } : {}),
        });
      }
      throw error;
    }
  }
}
