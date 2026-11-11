import {
  LARK_TABLES,
  NHAN_XET_BAT_BUOC,
  NHAN_XET_FIELDS,
  REQUIRED_FIELDS,
  type LarkData,
  type LarkRecord,
  type LarkSource,
  type LarkTableInfo,
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

export const IDS = {
  lopA: 'recLopMauA',
  lopB: 'recLopMauB',
  s1: 'recHocVienMau01',
  s2: 'recHocVienMau02',
  s3: 'recHocVienMau03',
  s4: 'recHocVienMau04',
  s5: 'recHocVienMau05',
  s6: 'recHocVienMau06',
  s7: 'recHocVienMau07',
  contactMe: 'recContactMau01',
  contactBo: 'recContactMau03',
  contactNoPhone: 'recContactMau04',
  contactLead: 'recContactLead',
  contactGrand: 'recContactMau06',
} as const;

const attendance = (
  id: string,
  student: string,
  lop: string,
  day: string,
  present: unknown,
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
    ...extra,
  });

/** The tables of the made-up Base, by the key the tests use: the fixed ones and one attendance table per year. */
export type FixtureTables = Record<
  | 'level'
  | 'lopHoc'
  | 'hocVien'
  | 'contact'
  | 'dealHp'
  | 'nhanXet2024'
  | 'nhanXet2025'
  | 'nhanXet2026',
  LarkRecord[]
>;
export type FixtureKey = keyof FixtureTables;

export function buildFixture(): FixtureTables {
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
        'Quan hệ': 'Mẹ',
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
        'Quan hệ': 'Mẹ',
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
        'Quan hệ': 'Bố',
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
    contact: [
      // The parent of s1 (first contact) and of s2 (second contact): one parent record, two links.
      rec(IDS.contactMe, {
        'Họ và tên PH contact': ' phụ huynh  mẫu 01 ',
        'MQH với HS': 'mẹ',
        'Tên con số 1': link(IDS.s1, 'Học viên Mẫu 01'),
        'Tên con số 2': link(IDS.s2, 'Học viên Mẫu 02'),
        'Số đt': '0900 000 001',
        'số zalo': '0900 000 011',
        email: 'phuhuynh.mau01@example.com',
        'Địa chỉ': 'Địa chỉ nhạy cảm mẫu',
        'Ghi chú': 'Ghi chú nhạy cảm mẫu',
      }),
      rec(IDS.contactBo, {
        'Họ và tên PH contact': 'Phụ huynh Mẫu 03',
        'MQH với HS': 'bố',
        'Tên con số 1': link(IDS.s3, 'Học viên Mẫu 03'),
        'Số đt': '0900000003',
      }),
      // A contact with no phone number: not imported, the student is left without a parent.
      rec(IDS.contactNoPhone, {
        'Họ và tên PH contact': 'Phụ huynh Mẫu 04',
        'MQH với HS': 'mẹ',
        'Tên con số 1': link(IDS.s4, 'Học viên Mẫu 04'),
      }),
      // A lead: no child, never imported.
      rec(IDS.contactLead, {
        'Họ và tên PH contact': 'Khách Mẫu',
        'Số đt': '0900000099',
      }),
    ],
    dealHp: [],
    nhanXet2024: [
      attendance('recNhanXet2024a', IDS.s1, IDS.lopA, '2024-12-02', '1'),
    ],
    nhanXet2025: [
      // Before the cut-off of 2025-02-01: already inside the opening balance.
      attendance('recNhanXet2025a', IDS.s1, IDS.lopA, '2025-01-27', '1'),
      attendance('recNhanXet2025b', IDS.s1, IDS.lopA, '2025-02-03', '1'),
      attendance('recNhanXet2025c', IDS.s1, IDS.lopA, '2025-02-10', '0'),
      attendance('recNhanXet2025d', IDS.s1, IDS.lopA, '2025-02-17', '1'),
      // "học lớp 2" is the age of the student, not a make-up: an error, never a deduction.
      attendance(
        'recNhanXet2025e',
        IDS.s1,
        IDS.lopA,
        '2025-02-24',
        'học lớp 2',
      ),
      // Sibling: one session after the cut-off; Lark says 2, the recomputed balance is 3.
      attendance('recNhanXet2025f', IDS.s2, IDS.lopA, '2025-02-03', '1'),
      // Student left out (unknown level): his row goes with him.
      attendance('recNhanXet2025g', IDS.s3, IDS.lopB, '2025-02-04', '1'),
    ],
    nhanXet2026: [
      attendance('recNhanXet2026a', IDS.s2, IDS.lopA, '2026-01-12', '1'),
      // A row with nothing in it (the real table has over a hundred): skipped and counted, never an error.
      rec('recNhanXet2026blank', {}),
      // A row with a date and nothing else is just as empty.
      rec('recNhanXet2026date', {
        'Ngày học - Day format': ms('2026-01-19'),
      }),
      // A mark of attendance with no student cannot be placed: an error.
      rec('recNhanXet2026nostudent', {
        'Ngày học - Day format': ms('2026-01-19'),
        'có mặt': 1,
      }),
    ],
  };
}

export function fixtureData(tables: FixtureTables = buildFixture()): LarkData {
  return {
    lopHoc: tables.lopHoc,
    hocVien: tables.hocVien,
    level: tables.level,
    contact: tables.contact,
    dealHp: tables.dealHp,
    nhanXet: [
      ...tables.nhanXet2024,
      ...tables.nhanXet2025,
      ...tables.nhanXet2026,
    ],
  };
}

const YEARLY: Record<'nhanXet2024' | 'nhanXet2025' | 'nhanXet2026', number> = {
  nhanXet2024: 2024,
  nhanXet2025: 2025,
  nhanXet2026: 2026,
};

/** Id, name and required fields of every table of the fixture. */
export function fixtureTableList(): {
  key: FixtureKey;
  id: string;
  name: string;
  fields: readonly string[];
}[] {
  return [
    ...(Object.keys(LARK_TABLES) as (keyof typeof LARK_TABLES)[]).map(
      (key) => ({
        key,
        id: LARK_TABLES[key].id,
        name: LARK_TABLES[key].title,
        fields: REQUIRED_FIELDS[key],
      }),
    ),
    ...(Object.keys(YEARLY) as (keyof typeof YEARLY)[]).map((key) => ({
      key,
      id: NHAN_XET_BAT_BUOC[YEARLY[key]] as string,
      name: `${YEARLY[key]} Nhận xét mỗi buổi`,
      fields: NHAN_XET_FIELDS,
    })),
  ];
}

/**
 * A source over the fixture. `drop` removes a field from a table's field list to simulate a renamed field; `hide`
 * leaves a table out of the list the way the Base hides a table the app may not read; `extra` adds tables to the list.
 */
export function fixtureSource(
  tables: FixtureTables = buildFixture(),
  options: {
    drop?: { table: FixtureKey; field: string };
    hide?: FixtureKey[];
    extra?: (LarkTableInfo & { fields?: readonly string[] })[];
  } = {},
): LarkSource & { calls: string[] } {
  const calls: string[] = [];
  const list = fixtureTableList();
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  return {
    calls,
    async tables() {
      calls.push('tables');
      return [
        ...list
          .filter((entry) => !options.hide?.includes(entry.key))
          .map(({ id, name }) => ({ id, name })),
        ...(options.extra ?? []).map(({ id, name }) => ({ id, name })),
      ];
    },
    async fieldNames(tableId) {
      const entry = byId.get(tableId);
      calls.push(`fields ${entry?.key ?? tableId}`);
      if (!entry)
        return (
          options.extra?.find((table) => table.id === tableId)?.fields ?? []
        );
      return entry.fields.filter(
        (field) =>
          !(
            options.drop &&
            options.drop.table === entry.key &&
            options.drop.field === field
          ),
      );
    },
    async records(tableId, fields) {
      const entry = byId.get(tableId);
      calls.push(`records ${entry?.key ?? tableId}`);
      const rows = entry ? tables[entry.key] : [];
      // Like Lark with `field_names`: only the fields asked for come back, so a field the plan reads without asking
      // for it is missing here and the tests catch it.
      if (!fields) return rows;
      const wanted = new Set(fields);
      return rows.map((row) => ({
        recordId: row.recordId,
        fields: Object.fromEntries(
          Object.entries(row.fields).filter(([name]) => wanted.has(name)),
        ),
      }));
    },
  };
}

export const TABLE_IDS = Object.fromEntries(
  fixtureTableList().map((entry) => [entry.key, entry.id]),
);

/**
 * Adds to a fixture the students and rows the payment rules need (DS-60 phase 3), all made up:
 * - `s6`: two paid Deals (one without the payment date, one with "chưa thống kê"), a grandparent as second contact on
 *   `Tên con số 2`, and attendance in 2025 and 2026 with one absence;
 * - `s7`: a Deal that was never paid, a paid Deal with no date at all and an empty Deal row.
 * A student's balance is then Σ packages − Σ sessions attended, with no cut-off date.
 */
export function withDealStudents(tables: FixtureTables): FixtureTables {
  tables.hocVien.push(
    rec(IDS.s6, {
      'Học viên': 'Học Viên Mẫu 06',
      'ID Học viên': 'HV-20240101-006',
      'Ngày sinh': ms('2014-04-04'),
      'cơ sở': 'Kim Liên',
      'Tình trạng học': 'Đang học',
      'Quan hệ': 'Bố',
      'Trình độ hiện tại': link('recLevel1', 'NM1'),
      'số buổi tồn update (vào ngày thống kê)': { type: 2, value: [3] },
      'Ngày update gần nhất về HP': ms('2026-01-01'),
    }),
    rec(IDS.s7, {
      'Học viên': 'Học Viên Mẫu 07',
      'ID Học viên': 'HV-20240101-007',
      'Ngày sinh': ms('2013-07-07'),
      'cơ sở': 'Kim Liên',
      'Tình trạng học': 'Đang học',
      'Trình độ hiện tại': link('recLevel1', 'NM1'),
    }),
  );
  tables.contact.push(
    rec(IDS.contactGrand, {
      'Họ và tên PH contact': 'Ông Bà Mẫu 06',
      'MQH với HS': 'ông / bà',
      'Tên con số 2': link(IDS.s6, 'Học viên Mẫu 06'),
      'Số đt': '0900000006',
    }),
    // Listed after the grandparent but on `Tên con số 1`: the main contact of s6.
    rec('recContactMau06b', {
      'Họ và tên PH contact': 'Phụ huynh Mẫu 06',
      'Tên con số 1': link(IDS.s6, 'Học viên Mẫu 06'),
      'Số đt': '0900000066',
    }),
  );
  const deal = (id: string, student: string, fields: Record<string, unknown>) =>
    rec(id, { 'Học viên': link(student, 'Học viên Mẫu'), ...fields });
  tables.dealHp.push(
    deal('recDealMau06a', IDS.s6, {
      'Ngày nộp HP': ms('2025-01-10'),
      'Đã nộp': 1,
      'Số buổi nộp': 10,
      'Số buổi đã học chưa thống kê': 2,
      'Số buổi còn tồn': 1,
    }),
    // No payment date: the start date stands in for it.
    deal('recDealMau06b', IDS.s6, {
      'Ngày bắt đầu': ms('2026-01-05'),
      'Đã nộp': 1,
      'Số buổi nộp': 8,
      'Số buổi còn tồn': 6,
    }),
    deal('recDealMau07a', IDS.s7, { 'Số buổi nộp': 4 }),
    deal('recDealMau07b', IDS.s7, { 'Đã nộp': 1, 'Số buổi nộp': 5 }),
    rec('recDealTrong', {}),
  );
  tables.nhanXet2025.push(
    attendance('recNhanXet2025s6a', IDS.s6, IDS.lopA, '2025-03-03', '1'),
    attendance('recNhanXet2025s6b', IDS.s6, IDS.lopA, '2025-03-10', '0'),
    attendance('recNhanXet2025s6c', IDS.s6, IDS.lopA, '2025-03-17', '1'),
  );
  tables.nhanXet2026.push(
    attendance('recNhanXet2026s6a', IDS.s6, IDS.lopA, '2026-02-02', '1'),
  );
  return tables;
}
