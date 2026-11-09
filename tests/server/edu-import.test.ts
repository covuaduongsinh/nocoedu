import { expect } from 'vitest';

import { importStudents, parseCsv } from '../../server/edu/import-csv.js';
import { seedSchool, test } from '../helpers/edu.js';

const HEADER =
  'hoTen,namSinh,coSoMa,lopMa,capHienTai,phuHuynhHoTen,phuHuynhSdt,phuHuynhZalo,quanHe';
const file = (...rows: string[]) => [HEADER, ...rows].join('\n');

const count = async (connection: any, table: string) =>
  (await connection.query.selectFrom(table).select('id').execute()).length;

test('parsing handles quotes, a byte order mark and Windows line ends', () => {
  expect(parseCsv('﻿a,"b,c","d ""e"""\r\n\r\nx,y,z\r\n')).toEqual([
    ['a', 'b,c', 'd "e"'],
    ['x', 'y', 'z'],
  ]);
});

test('a dry run reports and writes nothing; the real import writes once and shares a parent between siblings', async ({
  database,
  connection,
}) => {
  await seedSchool(connection, { hlvA: 'a', hlvB: 'b', managerA: 'c' });
  const students = await count(connection, 'eduHocVien');
  const csv = file(
    'Học viên Nhập 01,2016,CS-A,L-A1,tot,Phụ huynh Nhập 01,0900 111 001,,me',
    'Học viên Nhập 02,2018,CS-A,,ma,Phụ huynh Nhập 01,+84900111001,,me',
    'Học viên Nhập 03,2015,CS-B,,,Phụ huynh Nhập 03,0900111003,,bo',
  );

  const dry = await importStudents(database, csv, { dryRun: true });
  expect(dry).toEqual({ rows: 3, valid: 3, problems: [], written: 0 });
  expect(await count(connection, 'eduHocVien')).toBe(students);

  const real = await importStudents(database, csv, { dryRun: false });
  expect(real).toMatchObject({ valid: 3, problems: [], written: 3 });
  expect(await count(connection, 'eduHocVien')).toBe(students + 3);
  // Two siblings, one phone number: one parent record; the third student has a second.
  expect(await count(connection, 'eduPhuHuynh')).toBe(2);
  expect(await count(connection, 'eduHocVienPhuHuynh')).toBe(3);
  const codes = await connection.query
    .selectFrom('eduHocVien')
    .select('ma')
    .where('hoTen', '=', 'Học viên Nhập 01')
    .executeTakeFirstOrThrow();
  expect(codes.ma).toMatch(/^HS\d{5}$/u);
});

test('a duplicate stops the whole import: nothing is written, and the report holds no names or phone numbers', async ({
  database,
  connection,
}) => {
  await seedSchool(connection, { hlvA: 'a', hlvB: 'b', managerA: 'c' });
  await importStudents(
    database,
    file('Học viên Cũ 01,2016,CS-A,,,Phụ huynh Cũ 01,0900222001,,me'),
    { dryRun: false },
  );
  const before = await count(connection, 'eduHocVien');

  const csv = file(
    // Valid row first: it must not be written because a later row is a duplicate.
    'Học viên Mới 01,2017,CS-A,,,Phụ huynh Mới 01,0900222002,,me',
    // Same name, year and phone as an existing student (different spacing and case).
    'học  viên cũ 01,2016,CS-A,,,Phụ huynh Cũ 01,+84900222001,,me',
    // Twice in the file.
    'Học viên Mới 02,2017,CS-B,,,Phụ huynh Mới 02,0900222003,,me',
    'Học viên Mới 02,2017,CS-B,,,Phụ huynh Mới 02,0900222003,,me',
    // Invalid rows.
    'Học viên Sai 01,1800,CS-A,,,Phụ huynh Sai,0900222004,,me',
    'Học viên Sai 02,2016,CS-A,L-B1,,Phụ huynh Sai,0900222005,,me',
    'Học viên Sai 03,2016,CS-A,,,Phụ huynh Sai,12,,me',
  );
  const report = await importStudents(database, csv, { dryRun: false });
  expect(report.written).toBe(0);
  expect(report.problems).toEqual([
    { line: 3, code: 'DUPLICATE_EXISTING' },
    { line: 5, code: 'DUPLICATE_IN_FILE' },
    { line: 6, code: 'BAD_YEAR' },
    { line: 7, code: 'CLASS_NOT_IN_BRANCH' },
    { line: 8, code: 'BAD_PHONE' },
  ]);
  expect(await count(connection, 'eduHocVien')).toBe(before);
  const printed = JSON.stringify(report);
  expect(printed).not.toContain('Học viên');
  expect(printed).not.toContain('0900');
});

test('a file without the required columns is refused', async ({
  database,
  connection,
}) => {
  await seedSchool(connection, { hlvA: 'a', hlvB: 'b', managerA: 'c' });
  const report = await importStudents(database, 'ten,tuoi\nA,5\n', {
    dryRun: false,
  });
  expect(report.problems).toEqual([{ line: 1, code: 'MISSING_COLUMN' }]);
  expect(report.written).toBe(0);
});
