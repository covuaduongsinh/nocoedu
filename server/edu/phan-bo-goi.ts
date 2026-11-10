/**
 * Which sessions were deducted from which package (first in, first out), kept free of any database access.
 *
 * Nothing is stored: the allocation is worked out each time it is read from the packages and the balance ledger of one
 * student, so it can never disagree with the ledger. The rules, in order:
 *
 * 1. Capacity comes from the packages in the order they were bought (`ngayMua`, then id) and from positive manual
 *    adjustments (a ledger row of reason `dieu_chinh` with no package), which count as a package of their own dated
 *    on the day of the adjustment. A package that is not in effect (`trangThai` other than `hieu_luc`) has no capacity.
 * 2. Deductions come from the ledger, not from the attendance rows: every attendance row (`diemDanhId`) is the sum of
 *    its ledger rows. A refund (`diem_danh_sua` with a positive change) therefore cancels the deduction it undoes and
 *    a row whose total is not negative deducts nothing. A negative manual adjustment is a deduction without a session.
 * 3. Deductions are taken in the order of the sessions (date, then start time, then id) and each fills the earliest
 *    package that still has room, so a session is never moved to a later package because it was saved later.
 * 4. A deduction that finds no room left is "over the balance" (`vuotSoDu`): the student attended more than they paid.
 *
 * Open questions kept visible rather than decided here: a session attended before a package was bought still takes
 * from the earliest package with room (it does not wait for the package dated after it); and a make-up session
 * (`hoc_bu`) is a deduction like any other, because the ledger already holds what `sessionsToDeduct` decided.
 */
export interface PackageInput {
  /** `null` for a positive manual adjustment, which has no package row. */
  readonly goiHocId: number | null;
  readonly soBuoi: number;
  /** `YYYY-MM-DD`. */
  readonly ngayMua: string;
  /** Tie-break for the same day: the id of the package, or of the ledger row for an adjustment. */
  readonly thuTu: number;
  /** `false` for a cancelled package: it has no capacity. */
  readonly hieuLuc: boolean;
  readonly loai: 'mua' | 'chuyen_so_du' | 'dieu_chinh';
}

export interface DeductionInput {
  /** The attendance row, or `null` for a manual adjustment. */
  readonly diemDanhId: number | null;
  /** Sessions deducted (a positive number). */
  readonly soBuoi: number;
  /** Sort key of the session: `YYYY-MM-DD HH:MM`; a manual adjustment uses the day it was made. */
  readonly thoiDiem: string;
  readonly thuTu: number;
}

export interface LedgerRowInput {
  readonly id: number;
  readonly thayDoi: number;
  readonly lyDo: string;
  readonly goiHocId: number | null;
  readonly diemDanhId: number | null;
  /** `YYYY-MM-DD` of the ledger row. */
  readonly ngay: string;
}

export interface Allocation {
  readonly diemDanhId: number | null;
  readonly soBuoi: number;
}

export interface PackageAllocation {
  readonly goiHocId: number | null;
  readonly loai: PackageInput['loai'];
  readonly ngayMua: string;
  readonly soBuoi: number;
  readonly daDung: number;
  readonly conLai: number;
  readonly cacLanTru: readonly Allocation[];
}

export interface AllocationResult {
  readonly cacGoi: readonly PackageAllocation[];
  /** Deductions for which no package had room left. */
  readonly vuotSoDu: readonly Allocation[];
}

/** Splits the ledger of one student into the deductions and the adjustment packages the allocation works on. */
export function fromLedger(
  ledger: readonly LedgerRowInput[],
  sessionTime: ReadonlyMap<number, string>,
): { deductions: DeductionInput[]; adjustments: PackageInput[] } {
  const byAttendance = new Map<number, number>();
  const deductions: DeductionInput[] = [];
  const adjustments: PackageInput[] = [];
  for (const row of ledger) {
    if (row.diemDanhId !== null) {
      byAttendance.set(
        row.diemDanhId,
        (byAttendance.get(row.diemDanhId) ?? 0) - row.thayDoi,
      );
    } else if (row.lyDo === 'dieu_chinh' && row.goiHocId === null) {
      if (row.thayDoi > 0)
        adjustments.push({
          goiHocId: null,
          soBuoi: row.thayDoi,
          ngayMua: row.ngay,
          thuTu: row.id,
          hieuLuc: true,
          loai: 'dieu_chinh',
        });
      else if (row.thayDoi < 0)
        deductions.push({
          diemDanhId: null,
          soBuoi: -row.thayDoi,
          thoiDiem: `${row.ngay} 00:00`,
          thuTu: row.id,
        });
    }
  }
  for (const [diemDanhId, soBuoi] of byAttendance)
    if (soBuoi > 0)
      deductions.push({
        diemDanhId,
        soBuoi,
        thoiDiem: sessionTime.get(diemDanhId) ?? '',
        thuTu: diemDanhId,
      });
  return { deductions, adjustments };
}

export function allocateFifo(
  packages: readonly PackageInput[],
  deductions: readonly DeductionInput[],
): AllocationResult {
  const ordered = packages
    .filter((pack) => pack.hieuLuc && pack.soBuoi > 0)
    .slice()
    .sort(
      (a, b) =>
        a.ngayMua.localeCompare(b.ngayMua) ||
        a.thuTu - b.thuTu ||
        (a.goiHocId ?? 0) - (b.goiHocId ?? 0),
    );
  const used = ordered.map(() => 0);
  const taken: Allocation[][] = ordered.map(() => []);
  const over: Allocation[] = [];
  const queue = deductions
    .slice()
    .sort((a, b) => a.thoiDiem.localeCompare(b.thoiDiem) || a.thuTu - b.thuTu);
  let cursor = 0;
  for (const deduction of queue) {
    let left = deduction.soBuoi;
    while (left > 0) {
      while (cursor < ordered.length && used[cursor] >= ordered[cursor].soBuoi)
        cursor += 1;
      if (cursor >= ordered.length) {
        over.push({ diemDanhId: deduction.diemDanhId, soBuoi: left });
        break;
      }
      const room = ordered[cursor].soBuoi - used[cursor];
      const part = Math.min(room, left);
      used[cursor] += part;
      taken[cursor].push({ diemDanhId: deduction.diemDanhId, soBuoi: part });
      left -= part;
    }
  }
  // A package that is not in effect is still listed, with nothing used, so a page can show every package it has.
  const result: PackageAllocation[] = packages
    .slice()
    .sort(
      (a, b) =>
        a.ngayMua.localeCompare(b.ngayMua) ||
        a.thuTu - b.thuTu ||
        (a.goiHocId ?? 0) - (b.goiHocId ?? 0),
    )
    .map((pack) => {
      const index = ordered.indexOf(pack);
      const daDung = index === -1 ? 0 : used[index];
      return {
        goiHocId: pack.goiHocId,
        loai: pack.loai,
        ngayMua: pack.ngayMua,
        soBuoi: pack.soBuoi,
        daDung,
        conLai: index === -1 ? 0 : pack.soBuoi - daDung,
        cacLanTru: index === -1 ? [] : taken[index],
      };
    });
  return { cacGoi: result, vuotSoDu: over };
}
