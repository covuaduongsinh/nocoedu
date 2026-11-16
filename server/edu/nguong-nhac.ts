import type { DatabaseManager } from '@nocobase/db';

import { LOW_BALANCE_THRESHOLD } from './so-du.js';

type Queryable = {
  readonly query: ReturnType<DatabaseManager['connection']>['query'];
};

/**
 * The balance at which each branch starts reminding about tuition (`eduCoSo.nguongNhacBuoi`): a student of the
 * branch with this many sessions left or fewer is "running out". One reading serves the list of who to collect from,
 * the report, the warning after a register and the daily reminder, so they always name the same students.
 */
export interface ReminderThresholds {
  /** The threshold of a branch; the application's default for a branch that is not there. */
  of(coSoId: unknown): number;
  /** The highest threshold of any branch: a query asks for balances up to it, then `isLow` decides per student. */
  readonly highest: number;
  isLow(student: { coSoId?: unknown; soBuoiConLai?: unknown }): boolean;
}

/** A threshold as stored, kept within what a balance can sensibly be warned at. */
export const asThreshold = (value: unknown): number => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 50
    ? number
    : LOW_BALANCE_THRESHOLD;
};

export async function reminderThresholds(
  connection: Queryable,
): Promise<ReminderThresholds> {
  const branches = await connection.query
    .selectFrom('eduCoSo')
    .select(['id', 'nguongNhacBuoi'])
    .execute();
  const byBranch = new Map(
    branches.map((row) => [Number(row.id), asThreshold(row.nguongNhacBuoi)]),
  );
  const of = (coSoId: unknown): number =>
    byBranch.get(Number(coSoId)) ?? LOW_BALANCE_THRESHOLD;
  return {
    of,
    highest: Math.max(LOW_BALANCE_THRESHOLD, ...byBranch.values()),
    isLow: (student) => Number(student.soBuoiConLai) <= of(student.coSoId),
  };
}
