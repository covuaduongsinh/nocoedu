import { expect, test } from 'vitest';

import {
  allocateFifo,
  fromLedger,
  type LedgerRowInput,
  type PackageInput,
} from '../../server/edu/phan-bo-goi.js';

const pack = (
  id: number,
  soBuoi: number,
  ngayMua: string,
  extra: Partial<PackageInput> = {},
): PackageInput => ({
  goiHocId: id,
  soBuoi,
  ngayMua,
  thuTu: id,
  hieuLuc: true,
  loai: 'mua',
  ...extra,
});

const mark = (
  id: number,
  thayDoi: number,
  diemDanhId: number | null,
  lyDo = 'diem_danh',
): LedgerRowInput => ({
  id,
  thayDoi,
  lyDo,
  goiHocId: null,
  diemDanhId,
  ngay: '2026-11-01',
});

const times = new Map<number, string>([
  [1, '2026-10-01 18:00'],
  [2, '2026-10-08 18:00'],
  [3, '2026-10-15 18:00'],
  [4, '2026-10-22 18:00'],
]);

test('deductions fill the earliest package first and spill into the next one', () => {
  const { deductions } = fromLedger(
    [mark(1, -1, 1), mark(2, -1, 2), mark(3, -1, 3)],
    times,
  );
  const result = allocateFifo(
    [pack(11, 2, '2026-09-01'), pack(12, 10, '2026-10-10')],
    deductions,
  );
  expect(result.cacGoi.map((p) => [p.goiHocId, p.daDung, p.conLai])).toEqual([
    [11, 2, 0],
    [12, 1, 9],
  ]);
  expect(result.cacGoi[0].cacLanTru.map((a) => a.diemDanhId)).toEqual([1, 2]);
  expect(result.cacGoi[1].cacLanTru.map((a) => a.diemDanhId)).toEqual([3]);
  expect(result.vuotSoDu).toEqual([]);
});

test('the order of the packages is by purchase date, not by id', () => {
  const { deductions } = fromLedger([mark(1, -1, 1)], times);
  const result = allocateFifo(
    [pack(20, 5, '2026-10-05'), pack(21, 5, '2026-09-05')],
    deductions,
  );
  expect(result.cacGoi.map((p) => [p.goiHocId, p.daDung])).toEqual([
    [21, 1],
    [20, 0],
  ]);
});

test('a refund cancels the deduction it undoes, and an edited row counts once', () => {
  const { deductions } = fromLedger(
    [
      mark(1, -1, 1),
      mark(2, 1, 1, 'diem_danh_sua'), // attendance 1 changed to absent: refunded
      mark(3, -1, 2),
      mark(4, -1, 3),
      mark(5, 1, 3, 'diem_danh_sua'),
      mark(6, -1, 3, 'diem_danh_sua'), // refunded, then deducted again: still one
    ],
    times,
  );
  expect(deductions.map((d) => [d.diemDanhId, d.soBuoi])).toEqual(
    expect.arrayContaining([
      [2, 1],
      [3, 1],
    ]),
  );
  expect(deductions).toHaveLength(2);
  const result = allocateFifo([pack(11, 5, '2026-09-01')], deductions);
  expect(result.cacGoi[0].daDung).toBe(2);
});

test('an opening package is used like any other and a manual adjustment is a deduction or a package of its own', () => {
  const { deductions, adjustments } = fromLedger(
    [
      mark(1, -1, 1),
      mark(2, -1, null, 'dieu_chinh'), // manual: minus one, no session
      mark(3, 2, null, 'dieu_chinh'), // manual: plus two, no package
    ],
    times,
  );
  expect(adjustments).toHaveLength(1);
  expect(adjustments[0]).toMatchObject({ soBuoi: 2, loai: 'dieu_chinh' });
  const result = allocateFifo(
    [pack(11, 1, '2026-09-01', { loai: 'chuyen_so_du' }), ...adjustments],
    deductions,
  );
  // The session is taken by the opening package (1), the manual deduction by the adjustment package.
  expect(result.cacGoi.map((p) => [p.loai, p.daDung, p.conLai])).toEqual([
    ['chuyen_so_du', 1, 0],
    ['dieu_chinh', 1, 1],
  ]);
  expect(result.cacGoi[1].cacLanTru[0].diemDanhId).toBeNull();
});

test('a deduction beyond everything paid is over the balance, and a cancelled package has no room', () => {
  const { deductions } = fromLedger(
    [mark(1, -1, 1), mark(2, -1, 2), mark(3, -1, 3), mark(4, -1, 4)],
    times,
  );
  const result = allocateFifo(
    [pack(11, 2, '2026-09-01'), pack(12, 5, '2026-09-02', { hieuLuc: false })],
    deductions,
  );
  expect(result.cacGoi.map((p) => [p.goiHocId, p.daDung, p.conLai])).toEqual([
    [11, 2, 0],
    [12, 0, 0],
  ]);
  expect(result.vuotSoDu.map((a) => a.diemDanhId)).toEqual([3, 4]);
});

test('nothing used: every package is whole and nothing is over', () => {
  const result = allocateFifo([pack(11, 4, '2026-09-01')], []);
  expect(result).toEqual({
    cacGoi: [
      {
        goiHocId: 11,
        loai: 'mua',
        ngayMua: '2026-09-01',
        soBuoi: 4,
        daDung: 0,
        conLai: 4,
        cacLanTru: [],
      },
    ],
    vuotSoDu: [],
  });
});

test('a deduction larger than the room left in a package is split over two', () => {
  const result = allocateFifo(
    [pack(11, 1, '2026-09-01'), pack(12, 3, '2026-09-02')],
    [{ diemDanhId: 1, soBuoi: 2, thoiDiem: '2026-10-01 18:00', thuTu: 1 }],
  );
  expect(result.cacGoi.map((p) => p.daDung)).toEqual([1, 1]);
});
