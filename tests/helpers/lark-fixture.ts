import {
  LARK_TABLES,
  REQUIRED_FIELDS,
  type LarkData,
  type LarkRecord,
  type LarkSource,
  type LarkTableKey,
} from '../../server/edu/lark/nguon.js';

/**
 * A made-up Base with the structure decoded in phase 1 (`docs/lark/schema.md`): the field names, the types and the
 * shapes the records API gives them (single select = text, date = milliseconds, link = `record_ids` or
 * `link_record_ids`, lookup = `{ type, value }`, person = `[{ id, name, email }]`). Every name, number and code is
 * invented; nothing here comes from the club's data.
 */

/** Midnight in the club's calendar (UTC+7) of a day, in milliseconds. */
export const ms = (day: string): number => Date.parse(`${day}T00:00:00+07:00`);

const rec = (
  recordId: string,
  fields: Record<string, unknown>,
): LarkRecord => ({
  recordId,
  fields,
});

const link = (id: string, text: string) => [
  {
    record_ids: [id],
    table_id: 'tblFixture',
    text,
    text_arr: [text],
    type: 'text',
  },
];
const oldLink = (id: string) => ({ link_record_ids: [id] });
const lookupText = (...values: string[]) => ({
  type: 1,
  value: values.map((text) => ({ text, type: 'text' })),
});

export const IDS = {
  lopA: 'recLopMauA',
  lopB: 'recLopMauB',
  s1: 'recHocVienMau01',
  s2: 'recHocVienMau02',
  s3: 'recHocVienMau03',
  s4: 'recHocVienMau04',
  s5: 'recHocVienMau05',
} as const;

const attendance = (
  id: string,
  student: string,
  lop: string,
  day: string,
  present: unknown,
  remaining: string,
  extra: Record<string, unknown> = {},
): LarkRecord =>
  rec(id, {
    'Ngày học': day.split('-').reverse().join('/'),
    'Ngày học - Day format': ms(day),
    'Tên HS':
      student === IDS.s2 ? oldLink(student) : link(student, 'Học viên Mẫu'),
    Lớp: link(lop, 'Lớp Mẫu'),
    'có mặt': present,
    'Kế hoạch dạy': 'Kế hoạch mẫu',
    'Làm BTVN': 1,
    'Ý thức': 8,
    'Kiến thức / lý thuyết mới': 'Kiến thức mẫu',
    'Nhận xét': 'Nhận xét mẫu',
    'Giao BTVN': 'Bài mẫu',
    'KH buổi sau': 'Kế hoạch mẫu 2',
    'Số buổi còn lại': remaining,
    ...extra,
  });

export function buildFixture(): { [K in LarkTableKey]: LarkRecord[] } {
  return {
    level: [
      rec('recLevel1', { 'Tên viết tắt level': 'NM1' }),
      rec('recLevel2', { 'Tên viết tắt level': 'Mã' }),
      rec('recLevelTest', { 'Tên viết tắt level': 'Test' }),
    ],
    lopHoc: [
      rec(IDS.lopA, {
        'Tên lớp': '  lớp  mẫu a ',
        'cơ sở': 'Kim Liên',
        Thứ: 'Thứ 2',
        'Ca dạy': 'Ca1 (18h15-19h15)',
        'GV Phụ trách': [
          {
            id: 'ou_fixture',
            name: 'Giáo viên Mẫu',
            email: 'gv.mau@example.com',
          },
        ],
      }),
      rec(IDS.lopB, {
        'Tên lớp': 'Lớp Mẫu B',
        'cơ sở': 'Vĩnh Phúc',
        Thứ: 'Thứ 3',
        'Ca dạy': 'Ca2 (19h30-20h45)',
        'GV Phụ trách': [],
      }),
    ],
    hocVien: [
      rec(IDS.s1, {
        'Học viên': ' học  viên mẫu 01 ',
        'ID Học viên': 'HV-20240101-001',
        'Ngày sinh': ms('2016-05-20'),
        'email PH': 'phuhuynh.mau01@example.com',
        'cơ sở': 'Kim Liên',
        'Tình trạng học': 'Đang học',
        'Họ tên PH': lookupText('phụ huynh mẫu 01'),
        'Quan hệ': 'Mẹ',
        'SDT PH': [{ fullPhoneNum: '0900 000 001' }],
        'Trình độ hiện tại': link('recLevel1', 'NM1'),
        'số buổi tồn update (vào ngày thống kê)': { type: 2, value: [5] },
        'Ngày update gần nhất về HP': ms('2025-02-01'),
        'Ghi chú': 'Ghi chú nhạy cảm mẫu',
      }),
      // A sibling: the phone number came from a number column and lost its leading 0.
      rec(IDS.s2, {
        'Học viên': 'Học Viên Mẫu 02',
        'ID Học viên': 'HV-20240101-002',
        'Ngày sinh': ms('2018-01-02'),
        'cơ sở': 'Kim Liên',
        'Tình trạng học': 'Mới học thử',
        'Họ tên PH': lookupText('Phụ huynh Mẫu 01'),
        'Quan hệ': 'Mẹ',
        'SDT PH': { type: 2, value: [900000001] },
        'Trình độ hiện tại': oldLink('recLevel2'),
        'số buổi tồn update (vào ngày thống kê)': { type: 2, value: [4] },
        'Ngày update gần nhất về HP': ms('2025-02-01'),
      }),
      rec(IDS.s3, {
        'Học viên': 'Học Viên Mẫu 03',
        'ID Học viên': 'HV-20240101-003',
        'Ngày sinh': ms('2017-03-03'),
        'cơ sở': 'Vĩnh Phúc',
        'Tình trạng học': 'Đang học',
        'Họ tên PH': lookupText('Phụ huynh Mẫu 03'),
        'Quan hệ': 'Bố',
        'SDT PH': [{ fullPhoneNum: '0900000003' }],
        'Trình độ hiện tại': link('recLevelTest', 'Test'),
      }),
      rec(IDS.s4, {
        'Học viên': 'Học Viên Mẫu 04',
        'ID Học viên': 'HV-20240101-004',
        'cơ sở': 'Vĩnh Phúc',
        'Tình trạng học': 'Đang học',
        'Trình độ hiện tại': link('recLevel1', 'NM1'),
      }),
      rec(IDS.s5, {
        'Học viên': 'Học Viên Mẫu 05',
        'ID Học viên': 'HV-20240101-005',
        'Ngày sinh': ms('2015-09-09'),
        'cơ sở': 'Vĩnh Phúc',
        'Tình trạng học': 'Đang học',
        'Trình độ hiện tại': link('recLevel1', 'NM1'),
      }),
    ],
    nhanXet2024: [
      attendance('recNhanXet2024a', IDS.s1, IDS.lopA, '2024-12-02', '1', '9'),
    ],
    nhanXet2025: [
      // Before the cut-off of 2025-02-01: already inside the opening balance.
      attendance('recNhanXet2025a', IDS.s1, IDS.lopA, '2025-01-27', '1', '5'),
      attendance('recNhanXet2025b', IDS.s1, IDS.lopA, '2025-02-03', '1', '4'),
      attendance('recNhanXet2025c', IDS.s1, IDS.lopA, '2025-02-10', '0', '4'),
      attendance('recNhanXet2025d', IDS.s1, IDS.lopA, '2025-02-17', '1', '3'),
      // "học lớp 2" is the age of the student, not a make-up: an error, never a deduction.
      attendance(
        'recNhanXet2025e',
        IDS.s1,
        IDS.lopA,
        '2025-02-24',
        'học lớp 2',
        '3',
      ),
      // Sibling: one session after the cut-off; Lark says 2, the recomputed balance is 3.
      attendance('recNhanXet2025f', IDS.s2, IDS.lopA, '2025-02-03', '1', '2'),
      // Student left out (unknown level): his row goes with him.
      attendance('recNhanXet2025g', IDS.s3, IDS.lopB, '2025-02-04', '1', '1'),
    ],
  };
}

export function fixtureData(): LarkData {
  return buildFixture();
}

/** A source over the fixture; `drop` removes a field from a table's field list to simulate a renamed field. */
export function fixtureSource(
  data: LarkData = fixtureData(),
  drop?: { table: LarkTableKey; field: string },
): LarkSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fieldNames(table) {
      calls.push(`fields ${table}`);
      return REQUIRED_FIELDS[table].filter(
        (field) => !(drop && drop.table === table && drop.field === field),
      );
    },
    async records(table) {
      calls.push(`records ${table}`);
      return data[table];
    },
  };
}

export const TABLE_IDS = Object.fromEntries(
  Object.entries(LARK_TABLES).map(([key, value]) => [key, value.id]),
);
