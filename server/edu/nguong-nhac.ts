import type { DatabaseManager } from '@nocobase/db';

import { LOW_BALANCE_THRESHOLD } from './so-du.js';

type Connection = ReturnType<DatabaseManager['connection']>;

/**
 * The sessions-left threshold of each branch (`eduCoSo.nguongNhacBuoi`): a student with that many sessions left or
 * fewer is warned about. A student without a branch, or of a branch that is not listed, takes the default.
 *
 * The thresholds are plain numbers read for every branch, not rows shown to a caller: the caller's own scope still
 * decides which students are looked at; this only decides which of them count as low.
 */
export interface ReminderThresholds {
  /** The threshold of a branch. */
  of(coSoId: unknown): number;
  /** The largest threshold of any branch: the bound for a first, coarse filter that `isLow` then narrows. */
  readonly highest: number;
  /** Whether a student of this branch with this balance is low (a negative balance is low too). */
  isLow(coSoId: unknown, balance: number): boolean;
}

export function makeReminderThresholds(
  byBranch: ReadonlyMap<number, number>,
): ReminderThresholds {
  const of = (coSoId: unknown): number => {
    const id = Number(coSoId);
    return (
      (Number.isFinite(id) ? byBranch.get(id) : undefined) ??
      LOW_BALANCE_THRESHOLD
    );
  };
  return {
    of,
    highest: Math.max(LOW_BALANCE_THRESHOLD, ...byBranch.values()),
    isLow: (coSoId, balance) => balance <= of(coSoId),
  };
}

export async function reminderThresholds(
  connection: Pick<Connection, 'query'>,
): Promise<ReminderThresholds> {
  const rows = await connection.query
    .selectFrom('eduCoSo')
    .select(['id', 'nguongNhacBuoi'])
    .execute();
  const byBranch = new Map<number, number>();
  for (const row of rows) {
    const value = Number(row.nguongNhacBuoi);
    if (Number.isInteger(value) && value >= 0)
      byBranch.set(Number(row.id), value);
  }
  return makeReminderThresholds(byBranch);
}
