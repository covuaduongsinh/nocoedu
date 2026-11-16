import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useMemo, useState } from 'react';

import { text, useRequest, type Row } from './kit.js';

export interface ParentLink {
  readonly id: number;
  readonly phuHuynhId: number;
  readonly hanLuc: string;
  readonly thuHoiLuc: string | null;
  readonly xemCuoiLuc: string | null;
  readonly soLanXem: number;
}

/** Whether a person may see the links; the links are asked for only then. */
export function useParentLinks(studentId: number): {
  readonly canView: boolean;
  readonly canManage: boolean;
  /** The newest link of each parent. */
  readonly byParent: ReadonlyMap<number, ParentLink>;
  /** The moment the links were read: a link is expired or valid as of this time. */
  readonly now: number;
  readonly reload: () => void;
} {
  const canView = useCan({
    resource: { type: 'composite', id: 'edu.congPhuHuynh' },
    action: 'view',
  }).can;
  const canManage = useCan({
    resource: { type: 'composite', id: 'edu.congPhuHuynh' },
    action: 'manage',
  }).can;
  const links = useRequest<readonly Row[]>(
    'congPhuHuynh/danhSach',
    { hocVienId: studentId },
    { enabled: canView },
  );
  const byParent = useMemo(() => {
    const map = new Map<number, ParentLink>();
    if (links.result.state === 'ready') {
      // Newest first: the first row of a parent is the one that counts.
      for (const row of links.result.data) {
        const parentId = Number(row.phuHuynhId);
        if (!map.has(parentId))
          map.set(parentId, {
            id: Number(row.id),
            phuHuynhId: parentId,
            hanLuc: text(row.hanLuc),
            thuHoiLuc: row.thuHoiLuc == null ? null : text(row.thuHoiLuc),
            xemCuoiLuc: row.xemCuoiLuc == null ? null : text(row.xemCuoiLuc),
            soLanXem: Number(row.soLanXem),
          });
      }
    }
    return map;
  }, [links.result]);
  // The moment the file was opened; a link is expired or valid as of then.
  const [now] = useState(() => Date.now());
  return { canView, canManage, byParent, now, reload: links.reload };
}
