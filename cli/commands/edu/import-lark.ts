import { AppCommand, CommandError } from '@nocobase/app-cli';
import { Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';

/**
 * `pnpm nocobase app edu import-lark [--dry-run | --commit --user <id>]`: reads the club's Lark Base through the
 * official `lark-cli` (as the app bot, never as a person) and plans, or writes, the students, parents, classes,
 * opening packages and attendance. The framework puts an application's commands under the `app` topic, hence
 * `app edu import-lark`; in a Docker image it is `node dist/cli/index.js app edu import-lark`.
 *
 * - `--dry-run` (the default) writes nothing, not even the log, and prints a summary per table and the comparison of
 *   the recomputed balance with the balance on Lark.
 * - `--commit` writes in one transaction and records the run in `eduNhapLarkNhatKy`. It needs `--user`: the person
 *   who runs it, written as the creator of the packages and of the attendance rows.
 *
 * Environment: `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_DOMAIN` (never on the command line) and `LARK_CLI` (path of the
 * `lark-cli` binary, default `lark-cli` on `PATH`). Output holds counts, Lark record ids and reason codes only.
 */
export default class ImportLark extends AppCommand {
  static override summary =
    'Import students, classes, parents, packages and attendance from the Lark Base (dry run by default).';
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
      description: 'Read Lark and print the plan; write nothing (the default).',
    }),
    commit: Flags.boolean({
      default: false,
      description: 'Write the plan in one transaction and log the run.',
    }),
    user: Flags.string({
      description:
        'Id of the user who runs the import (required with --commit).',
    }),
    'delay-ms': Flags.integer({
      default: 1200,
      description: 'Milliseconds to wait between two calls to Lark.',
    }),
  };

  public async run(): Promise<unknown> {
    const { flags } = await this.parse(ImportLark);
    const { parseImportOptions, chayNhap, inBaoCao, USAGE_ERROR_CODES } =
      await import('../../../server/edu/lark/nhap.js');
    const { createLarkCliSource, LarkImportError } =
      await import('../../../server/edu/lark/nguon.js');

    let options: ReturnType<typeof parseImportOptions>;
    try {
      options = parseImportOptions({
        dryRun: flags['dry-run'],
        commit: flags.commit,
        user: flags.user,
        delayMs: flags['delay-ms'],
      });
    } catch (error) {
      if (error instanceof LarkImportError)
        throw new CommandError(error.message, { code: error.code, exit: 2 });
      throw error;
    }

    try {
      const source = await createLarkCliSource({
        delayMs: options.delayMs,
        log: (line) => this.log(line),
      });
      try {
        const report = await this.withApp(async ({ app }) => {
          app.registerProviders();
          const { databaseManagerToken } = await import('@nocobase/db');
          return chayNhap(
            app.container.resolve(databaseManagerToken),
            source,
            options,
            (line) => this.log(line),
          );
        });
        for (const line of inBaoCao(report)) this.log(line);
        if (!options.commit) this.setStatus('success-noop');
        return report;
      } finally {
        await source.close();
      }
    } catch (error) {
      if (error instanceof LarkImportError) {
        // Missing environment variables and flags are usage errors (exit 2); the rest is a failed run.
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
