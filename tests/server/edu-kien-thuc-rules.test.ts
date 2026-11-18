import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CURRICULUM_COLUMNS,
  MAX_CURRICULUM_ROWS,
  SAMPLE_CURRICULUM_ROWS,
  planCurriculum,
} from '../../server/edu/chuong-trinh-csv.js';
import { toCsv } from '../../server/edu/csv.js';
import {
  cleanCode,
  cleanText,
  deriveGaps,
  levelFromCell,
  progressOf,
} from '../../server/edu/kien-thuc.js';

/** Knowledge rules that need no database (GĐ 4): gaps, progress, code and level cells, the curriculum CSV plan. */
describe('cleaning values', () => {
  it('keeps a tidy code and refuses the rest', () => {
    expect(cleanCode(' T01-02 ')).toBe('T01-02');
    expect(cleanCode('Tốt.1_a')).toBe('Tốt.1_a');
    expect(cleanCode('')).toBeUndefined();
    expect(cleanCode('-x')).toBeUndefined();
    expect(cleanCode('a b')).toBeUndefined();
    expect(cleanCode('x'.repeat(41))).toBeUndefined();
    expect(cleanCode(5)).toBeUndefined();
  });

  it('tidies a name and refuses an empty or long one', () => {
    expect(cleanText('  Cách   đi  của tốt ', 50)).toBe('Cách đi của tốt');
    expect(cleanText('   ', 50)).toBeUndefined();
    expect(cleanText('x'.repeat(51), 50)).toBeUndefined();
  });

  it('reads a level as its key or its title, with or without accents', () => {
    expect(levelFromCell('tot')).toBe('tot');
    expect(levelFromCell('Tốt')).toBe('tot');
    expect(levelFromCell(' TƯỢNG ')).toBe('tuong');
    expect(levelFromCell('tuong')).toBe('tuong');
    expect(levelFromCell('Hậu')).toBe('hau');
    expect(levelFromCell('Tướng')).toBeUndefined();
    expect(levelFromCell('')).toBeUndefined();
  });
});

describe('progress', () => {
  it('counts learned and graded skills of a level', () => {
    const known = new Map([
      [1, 'da_hoc'],
      [2, 'dat'],
      [3, 'vung'],
      [4, 'chua_vung'],
      [99, 'dat'],
    ]);
    expect(progressOf([1, 2, 3, 4, 5], known)).toEqual({
      tong: 5,
      daHoc: 3,
      dat: 2,
      chuaVung: 1,
      phanTram: 60,
    });
    expect(progressOf([], known).phanTram).toBe(0);
    expect(progressOf([5, 6], new Map()).phanTram).toBe(0);
  });
});

describe('gaps', () => {
  const students = [
    { id: 1, lopId: 10, nhomId: 100 },
    { id: 2, lopId: 10, nhomId: 101 },
    { id: 3, lopId: 10, nhomId: null },
  ];
  const sessions = [
    { id: 1, lopId: 10, ngay: '2026-11-02' },
    { id: 2, lopId: 10, ngay: '2026-11-09' },
    { id: 3, lopId: 11, ngay: '2026-11-03' },
  ];

  it('is a skill taught to the class while the student was absent', () => {
    const gaps = deriveGaps({
      students,
      sessions,
      taught: [{ buoiHocId: 1, kyNangId: 7, nhomId: null }],
      absences: [{ buoiHocId: 1, hocVienId: 1 }],
      known: [],
    });
    expect(gaps).toEqual([
      {
        hocVienId: 1,
        kyNangId: 7,
        lyDo: 'vang_buoi_day',
        buoiHocId: 1,
        ngay: '2026-11-02',
      },
    ]);
  });

  it('counts a group skill only for the students of that group', () => {
    const gaps = deriveGaps({
      students,
      sessions,
      taught: [{ buoiHocId: 1, kyNangId: 7, nhomId: 100 }],
      absences: [
        { buoiHocId: 1, hocVienId: 1 },
        { buoiHocId: 1, hocVienId: 2 },
        { buoiHocId: 1, hocVienId: 3 },
      ],
      known: [],
    });
    expect(gaps.map((g) => g.hocVienId)).toEqual([1]);
  });

  it('is closed by a make-up session or a grading (any state)', () => {
    const base = {
      students,
      sessions,
      taught: [{ buoiHocId: 1, kyNangId: 7, nhomId: null }],
      absences: [{ buoiHocId: 1, hocVienId: 1 }],
    };
    for (const mucDo of ['da_hoc', 'dat', 'vung']) {
      expect(
        deriveGaps({ ...base, known: [{ hocVienId: 1, kyNangId: 7, mucDo }] }),
      ).toEqual([]);
    }
  });

  it('lists a skill graded "not solid", absent or not, once', () => {
    const gaps = deriveGaps({
      students,
      sessions,
      taught: [{ buoiHocId: 1, kyNangId: 7, nhomId: null }],
      absences: [{ buoiHocId: 1, hocVienId: 1 }],
      known: [
        { hocVienId: 1, kyNangId: 7, mucDo: 'chua_vung' },
        { hocVienId: 2, kyNangId: 8, mucDo: 'chua_vung' },
      ],
    });
    expect(gaps).toEqual([
      {
        hocVienId: 1,
        kyNangId: 7,
        lyDo: 'chua_vung',
        buoiHocId: null,
        ngay: null,
      },
      {
        hocVienId: 2,
        kyNangId: 8,
        lyDo: 'chua_vung',
        buoiHocId: null,
        ngay: null,
      },
    ]);
  });

  it('dates a gap by the earliest absent session that taught it', () => {
    const gaps = deriveGaps({
      students,
      sessions,
      taught: [
        { buoiHocId: 2, kyNangId: 7, nhomId: null },
        { buoiHocId: 1, kyNangId: 7, nhomId: null },
      ],
      absences: [
        { buoiHocId: 2, hocVienId: 1 },
        { buoiHocId: 1, hocVienId: 1 },
      ],
      known: [],
    });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ buoiHocId: 1, ngay: '2026-11-02' });
  });

  it('ignores a session of another class and a student without an absence row', () => {
    const gaps = deriveGaps({
      students,
      sessions,
      taught: [
        { buoiHocId: 3, kyNangId: 7, nhomId: null },
        { buoiHocId: 1, kyNangId: 8, nhomId: null },
      ],
      // The student was absent from a session of another class; no row at all for student 3 in session 1.
      absences: [{ buoiHocId: 3, hocVienId: 1 }],
      known: [],
    });
    expect(gaps).toEqual([]);
  });

  it('limits the result to the wanted skills and orders by skill then student', () => {
    const gaps = deriveGaps({
      students,
      sessions,
      taught: [
        { buoiHocId: 1, kyNangId: 9, nhomId: null },
        { buoiHocId: 1, kyNangId: 7, nhomId: null },
      ],
      absences: [
        { buoiHocId: 1, hocVienId: 3 },
        { buoiHocId: 1, hocVienId: 1 },
      ],
      known: [],
      skillIds: new Set([7, 9]),
    });
    expect(gaps.map((g) => [g.kyNangId, g.hocVienId])).toEqual([
      [7, 1],
      [7, 3],
      [9, 1],
      [9, 3],
    ]);
    expect(
      deriveGaps({
        students,
        sessions,
        taught: [{ buoiHocId: 1, kyNangId: 9, nhomId: null }],
        absences: [{ buoiHocId: 1, hocVienId: 1 }],
        known: [],
        skillIds: new Set([7]),
      }),
    ).toEqual([]);
  });
});

describe('curriculum CSV plan', () => {
  const none = { topics: [], skills: [], books: new Map<string, number>() };
  const header = CURRICULUM_COLUMNS.join(',');
  const rows = (...lines: string[]) => [header, ...lines].join('\n');

  it('plans the sample file we hand to the head coach', () => {
    const csv = toCsv(CURRICULUM_COLUMNS, SAMPLE_CURRICULUM_ROWS);
    const plan = planCurriculum(csv, none);
    expect(plan.report.problems).toEqual([]);
    expect(plan.report).toMatchObject({
      rows: 2,
      chuDeMoi: 1,
      kyNangMoi: 2,
    });
    expect(plan.skills.map((s) => s.thuTu)).toEqual([1, 2]);
  });

  it('has a sample file in docs/ that the import accepts and that is what the server hands out', () => {
    const file = readFileSync(
      path.resolve(import.meta.dirname, '../../docs/mau-chuong-trinh.csv'),
      'utf8',
    );
    expect(file).toBe(toCsv(CURRICULUM_COLUMNS, SAMPLE_CURRICULUM_ROWS));
    // Only the header and two example rows, no real data.
    expect(file.split('\r\n').filter(Boolean)).toHaveLength(3);
    expect(planCurriculum(file, none).report.problems).toEqual([]);
  });

  it('appends after what exists and is idempotent on a second run', () => {
    const csv = rows(
      'tot,T01,Làm quen bàn cờ,T01-01,Ô cờ,,',
      'tot,T01,Làm quen bàn cờ,T01-02,Tốt đi,,',
      'tot,T02,Chiếu hết,T02-01,Chiếu,,',
    );
    const first = planCurriculum(csv, none);
    expect(first.report).toMatchObject({ chuDeMoi: 2, kyNangMoi: 3 });
    const again = planCurriculum(csv, {
      topics: first.topics.map((t, i) => ({
        id: i + 1,
        levelKey: t.levelKey,
        ma: t.ma,
        ten: t.ten,
        thuTu: t.thuTu,
      })),
      skills: first.skills.map((s, i) => ({
        id: i + 1,
        chuDeId: first.topics.findIndex((t) => t.ma === s.chuDeMa) + 1,
        ma: s.ma,
        ten: s.ten,
        moTa: s.moTa,
        sachId: s.sachId,
        thuTu: s.thuTu,
      })),
      books: new Map(),
    });
    expect(again.report).toMatchObject({
      chuDeMoi: 0,
      chuDeCapNhat: 0,
      kyNangMoi: 0,
      kyNangCapNhat: 0,
      giuNguyen: 5,
    });
    // New skill under an existing topic goes after its last skill.
    const more = planCurriculum(
      rows('tot,T01,Làm quen bàn cờ,T01-03,Vua đi,,'),
      {
        topics: [
          {
            id: 1,
            levelKey: 'tot',
            ma: 'T01',
            ten: 'Làm quen bàn cờ',
            thuTu: 1,
          },
        ],
        skills: [
          {
            id: 1,
            chuDeId: 1,
            ma: 'T01-01',
            ten: 'a',
            moTa: null,
            sachId: null,
            thuTu: 1,
          },
          {
            id: 2,
            chuDeId: 1,
            ma: 'T01-02',
            ten: 'b',
            moTa: null,
            sachId: null,
            thuTu: 2,
          },
        ],
        books: new Map(),
      },
    );
    expect(more.skills[0]).toMatchObject({ thuTu: 3, action: 'moi', id: null });
  });

  it('updates a name, never a level or a parent topic', () => {
    const existing = {
      topics: [
        { id: 1, levelKey: 'tot', ma: 'T01', ten: 'Cũ', thuTu: 1 },
        { id: 2, levelKey: 'tot', ma: 'T02', ten: 'Hai', thuTu: 2 },
      ],
      skills: [
        {
          id: 1,
          chuDeId: 1,
          ma: 'S1',
          ten: 'Cũ',
          moTa: 'mô tả',
          sachId: null,
          thuTu: 1,
        },
      ],
      books: new Map([['sgk1', 7]]),
    };
    const renamed = planCurriculum(
      rows('tot,T01,Mới,S1,Tên mới,mô tả,SGK1'),
      existing,
    );
    expect(renamed.report).toMatchObject({ chuDeCapNhat: 1, kyNangCapNhat: 1 });
    expect(renamed.skills[0]).toMatchObject({ sachId: 7, id: 1 });
    expect(
      planCurriculum(rows('tướng,T01,Mới,S9,x,,'), existing).report.problems,
    ).toEqual([{ line: 2, code: 'BAD_LEVEL' }]);
    expect(
      planCurriculum(rows('xe,T01,Cũ,S1,Cũ,,'), existing).report.problems,
    ).toEqual([{ line: 2, code: 'TOPIC_OTHER_LEVEL' }]);
    expect(
      planCurriculum(rows('tot,T02,Hai,S1,Cũ,,'), existing).report.problems,
    ).toEqual([{ line: 2, code: 'SKILL_OTHER_TOPIC' }]);
  });

  it('keeps an existing description when the file has no such column', () => {
    const plan = planCurriculum(
      'cap,maChuDe,tenChuDe,maKyNang,tenKyNang\ntot,T01,Cũ,S1,Cũ\n',
      {
        topics: [{ id: 1, levelKey: 'tot', ma: 'T01', ten: 'Cũ', thuTu: 1 }],
        skills: [
          {
            id: 1,
            chuDeId: 1,
            ma: 'S1',
            ten: 'Cũ',
            moTa: 'giữ lại',
            sachId: 3,
            thuTu: 1,
          },
        ],
        books: new Map(),
      },
    );
    expect(plan.skills[0]).toMatchObject({
      action: 'giu',
      moTa: 'giữ lại',
      sachId: 3,
    });
  });

  it('reports each problem by line and code, never a value', () => {
    const csv = rows(
      'tot,T01,Một,S1,Một,,',
      'tot,T01,Khác tên,S2,Hai,,', // TOPIC_CONFLICT
      'tot,T01,Một,S1,Một nữa,,', // DUPLICATE_SKILL_IN_FILE
      'tot,,Thiếu mã,S3,Ba,,', // MISSING_FIELD
      'tot,T03,Ba,S4,,,', // skill code without name
      'tot,T03,Ba,S5,Năm,,không-có', // UNKNOWN_BOOK
      'tot,-bad,Bốn,S6,Sáu,,', // BAD_CODE
    );
    const { problems } = planCurriculum(csv, none).report;
    expect(problems).toEqual([
      { line: 3, code: 'TOPIC_CONFLICT' },
      { line: 4, code: 'DUPLICATE_SKILL_IN_FILE' },
      { line: 5, code: 'MISSING_FIELD' },
      { line: 6, code: 'MISSING_FIELD' },
      { line: 7, code: 'UNKNOWN_BOOK' },
      { line: 8, code: 'BAD_CODE' },
    ]);
  });

  it('refuses a file without the required columns, too large, too long, or with a bad encoding', () => {
    expect(
      planCurriculum('cap,maChuDe\ntot,T01', none).report.problems,
    ).toEqual([{ line: 1, code: 'MISSING_COLUMN' }]);
    expect(planCurriculum('a\u0000b', none).report.problems[0]?.code).toBe(
      'BAD_ENCODING',
    );
    expect(
      planCurriculum(`${header}\n${'x'.repeat(600 * 1024)}`, none).report
        .problems[0]?.code,
    ).toBe('FILE_TOO_LARGE');
    const many = rows(
      ...Array.from(
        { length: MAX_CURRICULUM_ROWS + 1 },
        (_, i) => `tot,T01,Một,S${i},Kỹ năng,,`,
      ),
    );
    expect(planCurriculum(many, none).report.problems[0]?.code).toBe(
      'TOO_MANY_ROWS',
    );
  });

  it('reads the level by title and a topic-only row', () => {
    const plan = planCurriculum(rows('Tốt,T01,Chủ đề rỗng,,,,'), none);
    expect(plan.report.problems).toEqual([]);
    expect(plan.topics).toHaveLength(1);
    expect(plan.skills).toHaveLength(0);
  });
});
