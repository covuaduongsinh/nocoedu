import { AppCommand, CommandError } from '@nocobase/app-cli';
import { Flags } from '@oclif/core';
import type { Interfaces } from '@oclif/core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ImportResult {
  readonly rows: number;
  readonly valid: number;
  readonly problems: readonly { line: number; code: string }[];
  readonly written: number;
}

/**
 * `pnpm nocobase app edu import-hoc-vien`: imports students and their parents from a CSV file.
 *
 * The file is named by the `EDU_IMPORT_CSV` environment variable (an absolute path outside the repository, because it
 * holds real children's data). It is all or nothing: a duplicate (same name, birth year and parent phone) or an
 * invalid row stops the import with nothing written. Output names rows by line number and reason, never a name.
 */
export default class ImportHocVien extends AppCommand {
  static override summary =
    'Import students and parents from a CSV file named by EDU_IMPORT_CSV (all or nothing).';
  static override examples = [
    '<%= config.bin %> <%= command.id %> --dry-run --json',
    '<%= config.bin %> <%= command.id %>',
  ];
  static override flags: { 'dry-run': Interfaces.BooleanFlag<boolean> } = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Check the file and report; write nothing.',
    }),
  };

  public async run(): Promise<ImportResult> {
    const { flags } = await this.parse(ImportHocVien);
    const file = process.env.EDU_IMPORT_CSV;
    if (!file || !path.isAbsolute(file)) {
      throw new CommandError(
        'Set EDU_IMPORT_CSV to the absolute path of the CSV file.',
        { code: 'IMPORT_FILE_NOT_SET', exit: 2 },
      );
    }
    const relative = path.relative(this.rootDir, file);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      throw new CommandError(
        'The CSV file must be outside the repository: it holds real personal data.',
        { code: 'IMPORT_FILE_IN_REPOSITORY', exit: 2 },
      );
    }
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      throw new CommandError('The CSV file could not be read.', {
        code: 'IMPORT_FILE_UNREADABLE',
      });
    }
    const report = await this.withApp(async ({ app }) => {
      app.registerProviders();
      const { databaseManagerToken } = await import('@nocobase/db');
      const { importStudents } =
        await import('../../../server/edu/import-csv.js');
      return importStudents(app.container.resolve(databaseManagerToken), text, {
        dryRun: flags['dry-run'],
      });
    });
    const result: ImportResult = {
      rows: report.rows,
      valid: report.valid,
      problems: report.problems,
      written: report.written,
    };
    if (report.problems.length > 0) {
      throw new CommandError(
        `${report.problems.length} row(s) have a problem; nothing was written.`,
        {
          code: 'IMPORT_HAS_PROBLEMS',
          details: { rows: report.rows, problems: report.problems },
        },
      );
    }
    if (flags['dry-run']) {
      this.setStatus('success-noop');
      this.log(
        `Dry run: ${report.valid} of ${report.rows} rows are ready; nothing was written.`,
      );
    } else {
      this.log(`Imported ${report.written} students.`);
    }
    return result;
  }
}
