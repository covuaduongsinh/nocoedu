import { defineRecordAccess } from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

import { anyOf } from './filters.js';

/**
 * The three data scopes of NocoEdu.
 *
 * - `recordAccess.allRecords` (built in): every record, for administrators and accountants.
 * - `edu.myBranches`: records of the branches the user manages (table `eduCoSoQuanLy`).
 * - `edu.myClasses`: records of the classes the user teaches (`eduLop.hlvId`).
 *
 * A resolver answers `false` — never "all records" — when the user has no branch or class, so a coach with no class
 * sees nothing. The lookups are trusted internal queries; their results only narrow what the caller may read.
 */
export const MY_BRANCHES = 'edu.myBranches';
export const MY_CLASSES = 'edu.myClasses';

const SCOPED_COLLECTIONS = [
  'eduCoSo',
  'eduLop',
  'eduLopLich',
  'eduHocVien',
  'eduHocVienLenCap',
  'eduPhuHuynh',
  'eduHocVienPhuHuynh',
  'eduDongY',
  'eduBuoiHoc',
  'eduDiemDanh',
  'eduGoiHoc',
  'eduThanhToan',
  'eduPhatSach',
  'eduSoDuNhatKy',
  'eduNhanXetThang',
  'eduCoSoQuanLy',
  'eduXuatDuLieuNhatKy',
] as const;

type Query = ReturnType<DatabaseManager['connection']>['query'];

interface Scope {
  readonly coSoIds: readonly number[];
  readonly lopIds: readonly number[];
  readonly hocVienIds: readonly number[];
}

const ids = (rows: readonly { id?: unknown }[], key = 'id'): number[] =>
  rows.map((row) => Number((row as Record<string, unknown>)[key]));

async function branchScope(query: Query, userId: string): Promise<Scope> {
  const links = await query
    .selectFrom('eduCoSoQuanLy')
    .select('coSoId')
    .where('userId', '=', userId)
    .execute();
  const coSoIds = ids(links, 'coSoId');
  if (!coSoIds.length) return { coSoIds, lopIds: [], hocVienIds: [] };
  const lops = await query
    .selectFrom('eduLop')
    .select('id')
    .where('coSoId', 'in', coSoIds)
    .execute();
  const students = await query
    .selectFrom('eduHocVien')
    .select('id')
    .where('coSoId', 'in', coSoIds)
    .execute();
  return { coSoIds, lopIds: ids(lops), hocVienIds: ids(students) };
}

async function classScope(query: Query, userId: string): Promise<Scope> {
  const lops = await query
    .selectFrom('eduLop')
    .select(['id', 'coSoId'])
    .where('hlvId', '=', userId)
    .execute();
  const lopIds = ids(lops);
  if (!lopIds.length) return { coSoIds: [], lopIds, hocVienIds: [] };
  const students = await query
    .selectFrom('eduHocVien')
    .select('id')
    .where('lopId', 'in', lopIds)
    .execute();
  return {
    coSoIds: [...new Set(ids(lops, 'coSoId'))],
    lopIds,
    hocVienIds: ids(students),
  };
}

async function parentIds(
  query: Query,
  hocVienIds: readonly number[],
): Promise<number[]> {
  if (!hocVienIds.length) return [];
  const links = await query
    .selectFrom('eduHocVienPhuHuynh')
    .select('phuHuynhId')
    .where('hocVienId', 'in', hocVienIds)
    .execute();
  return ids(links, 'phuHuynhId');
}

export function registerEduRecordAccess(
  authz: AppAuthorization,
  database: DatabaseManager,
): void {
  const resolve = async (
    mode: 'branches' | 'classes',
    userId: string,
    collection: string,
  ) => {
    const query = database.connection().query;
    const scope =
      mode === 'branches'
        ? await branchScope(query, userId)
        : await classScope(query, userId);
    switch (collection) {
      case 'eduCoSo':
        return scope.coSoIds.length ? anyOf('id', scope.coSoIds) : false;
      case 'eduCoSoQuanLy':
        // Only a branch manager scope can see who manages the branch; a coach has no business there.
        return mode === 'branches' && scope.coSoIds.length
          ? anyOf('coSoId', scope.coSoIds)
          : false;
      case 'eduLop':
        // Structural filters (a column of the row itself) so a row created in this request is already in scope.
        return mode === 'branches'
          ? scope.coSoIds.length
            ? anyOf('coSoId', scope.coSoIds)
            : false
          : scope.lopIds.length
            ? anyOf('id', scope.lopIds)
            : false;
      case 'eduLopLich':
      case 'eduBuoiHoc':
      case 'eduNhanXetThang':
        return scope.lopIds.length ? anyOf('lopId', scope.lopIds) : false;
      case 'eduHocVien':
        return mode === 'branches'
          ? scope.coSoIds.length
            ? anyOf('coSoId', scope.coSoIds)
            : false
          : scope.lopIds.length
            ? anyOf('lopId', scope.lopIds)
            : false;
      case 'eduPhuHuynh': {
        const parents = await parentIds(query, scope.hocVienIds);
        return parents.length ? anyOf('id', parents) : false;
      }
      case 'eduThanhToan':
      case 'eduPhatSach':
      case 'eduGoiHoc':
      case 'eduSoDuNhatKy':
      case 'eduDiemDanh':
      case 'eduDongY':
      case 'eduHocVienLenCap':
      case 'eduHocVienPhuHuynh':
        return scope.hocVienIds.length
          ? anyOf('hocVienId', scope.hocVienIds)
          : false;
      default:
        return false;
    }
  };

  authz.recordAccess.define(
    defineRecordAccess(MY_BRANCHES, (access) =>
      access
        .title('Cơ sở của tôi')
        .collections(...SCOPED_COLLECTIONS)
        .resolver(({ principal, collection }) =>
          principal.type === 'user'
            ? resolve('branches', principal.id, collection)
            : false,
        ),
    ),
  );
  authz.recordAccess.define(
    defineRecordAccess(MY_CLASSES, (access) =>
      access
        .title('Lớp tôi dạy')
        .collections(...SCOPED_COLLECTIONS)
        .resolver(({ principal, collection }) =>
          principal.type === 'user'
            ? resolve('classes', principal.id, collection)
            : false,
        ),
    ),
  );
}
