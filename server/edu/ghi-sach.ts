/**
 * Handing a book out to a student: the one writer of `eduPhatSach` besides the Lark import.
 *
 * The branch comes from the student and the amount from the book at that moment (`giaBan - uuDai`), kept in the row,
 * so a later price change rewrites nothing. Used by `POST /phatSach/ghi` and by the file import, in the caller's
 * transaction, with the policies of the caller's `edu.phatSach` `manage` and `edu.hocVien` `view`.
 */
import type { DatabaseConnection, RepositoryPolicy } from '@nocobase/db';

import { eduError } from './errors.js';
import { todayVn } from './so-du.js';

export async function handOutBook(
  connection: DatabaseConnection,
  input: {
    readonly hocVienId: number;
    readonly sachId: number;
    readonly ngay?: string;
    readonly uuDai: number;
    readonly ghiChu?: string | null;
    readonly userId: string;
    readonly policies: {
      readonly handout: RepositoryPolicy;
      readonly student: RepositoryPolicy | undefined;
    };
  },
): Promise<{ id: number; tienSach: number }> {
  const outOfScope = () =>
    eduError(
      'PERMISSION_DENIED',
      'EDU_OUT_OF_SCOPE',
      'You may not hand a book out here.',
    );
  if (!input.policies.student) throw outOfScope();
  const student = await connection
    .repository('eduHocVien')
    .withPolicy(input.policies.student)
    .findOne({ filter: { id: input.hocVienId } });
  if (!student) {
    throw eduError('NOT_FOUND', 'EDU_STUDENT_NOT_FOUND', 'Student not found.');
  }
  const book = await connection.query
    .selectFrom('eduSach')
    .select(['id', 'giaBan', 'trangThai'])
    .where('id', '=', input.sachId)
    .executeTakeFirst();
  if (!book) {
    throw eduError('NOT_FOUND', 'EDU_BOOK_NOT_FOUND', 'Book not found.');
  }
  if (book.trangThai !== 'dang_ban') {
    throw eduError(
      'FAILED_PRECONDITION',
      'EDU_BOOK_WITHDRAWN',
      'This book is no longer sold.',
      'sachId',
    );
  }
  const price = Number(book.giaBan);
  if (input.uuDai > price) {
    throw eduError(
      'FAILED_PRECONDITION',
      'EDU_DISCOUNT_TOO_LARGE',
      'The discount is more than the price of the book.',
      'uuDai',
    );
  }
  const handouts = connection
    .repository('eduPhatSach')
    .withPolicy(input.policies.handout);
  const created = await handouts.createOne({
    values: {
      hocVienId: input.hocVienId,
      sachId: input.sachId,
      coSoId: Number(student.coSoId),
      ngay: input.ngay ?? todayVn(),
      uuDai: input.uuDai,
      tienSach: price - input.uuDai,
      ghiChu: input.ghiChu ?? null,
      nguoiTaoId: input.userId,
      createdAt: new Date(),
    },
  });
  const id = Number(created.record.id);
  if (!(await handouts.findOne({ filter: { id } }))) throw outOfScope();
  return { id, tienSach: price - input.uuDai };
}
