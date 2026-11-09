import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import { PAGES } from '../../server/edu/pages.js';
import {
  coSo,
  coSoQuanLy,
  dongY,
  ext,
  hocVien,
  lienKet,
  lop,
  lopLich,
  phuHuynh,
} from '../../server/edu/permissions.js';
import { MY_BRANCHES, MY_CLASSES } from '../../server/edu/record-access.js';

/**
 * The five permission sets of NocoEdu. They are initial, editable configuration: an administrator may change them in
 * the permission pages afterwards, and the seed never overwrites a set that already exists. None is assigned to
 * anybody here — roles are given to named people in User management.
 *
 * Scopes: `allRecords` (built in), `edu.myBranches` (branches the user manages), `edu.myClasses` (classes the user
 * teaches). Each composite has one data scope named `data` (levelUp also `history`; ext `student`, `class`, `parent`).
 */
const page = (id: string) => ({
  resource: { type: 'page' as const, id },
  actions: [{ action: 'access' }],
});

const ALL = 'allRecords';

const everyPage = Object.values(PAGES).map(page);

export const eduQuanTri = definePermissionSet('edu_quan_tri')
  .title('NocoEdu - Quản trị')
  .grant(...everyPage)
  .grant(coSo.reference().grant({ view: { data: ALL }, manage: { data: ALL } }))
  .grant(
    coSoQuanLy
      .reference()
      .grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(lop.reference().grant({ view: { data: ALL }, manage: { data: ALL } }))
  .grant(
    lopLich.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(
    hocVien.reference().grant({
      view: { data: ALL },
      manage: { data: ALL },
      updateNote: { data: ALL },
      levelUp: { data: ALL, history: ALL },
    }),
  )
  .grant(
    phuHuynh.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(
    lienKet.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(
    dongY.reference().grant({ view: { data: ALL }, record: { data: ALL } }),
  )
  .build();

export const eduQuanLyCoSo = definePermissionSet('edu_quan_ly_co_so')
  .title('NocoEdu - Quản lý cơ sở')
  .grant(...everyPage)
  // A branch manager reads their branch; creating or editing branches is for administrators.
  .grant(coSo.reference().grant({ view: { data: MY_BRANCHES } }))
  .grant(
    lop
      .reference()
      .grant({ view: { data: MY_BRANCHES }, manage: { data: MY_BRANCHES } }),
  )
  .grant(
    lopLich
      .reference()
      .grant({ view: { data: MY_BRANCHES }, manage: { data: MY_BRANCHES } }),
  )
  .grant(
    hocVien.reference().grant({
      view: { data: MY_BRANCHES },
      manage: { data: MY_BRANCHES },
      updateNote: { data: MY_BRANCHES },
      levelUp: { data: MY_BRANCHES, history: MY_BRANCHES },
    }),
  )
  .grant(
    phuHuynh
      .reference()
      .grant({ view: { data: MY_BRANCHES }, manage: { data: MY_BRANCHES } }),
  )
  .grant(
    lienKet
      .reference()
      .grant({ view: { data: MY_BRANCHES }, manage: { data: MY_BRANCHES } }),
  )
  .grant(
    dongY
      .reference()
      .grant({ view: { data: MY_BRANCHES }, record: { data: MY_BRANCHES } }),
  )
  .build();

export const eduHlv = definePermissionSet('edu_hlv')
  .title('NocoEdu - Huấn luyện viên')
  .grant(page(PAGES.lop), page(PAGES.hocVien))
  .grant(coSo.reference().grant({ view: { data: MY_CLASSES } }))
  .grant(lop.reference().grant({ view: { data: MY_CLASSES } }))
  .grant(lopLich.reference().grant({ view: { data: MY_CLASSES } }))
  .grant(
    hocVien.reference().grant({
      view: { data: MY_CLASSES },
      updateNote: { data: MY_CLASSES },
      levelUp: { data: MY_CLASSES, history: MY_CLASSES },
    }),
  )
  .build();

export const eduKeToan = definePermissionSet('edu_ke_toan')
  .title('NocoEdu - Kế toán')
  .grant(
    page(PAGES.coSo),
    page(PAGES.lop),
    page(PAGES.hocVien),
    page(PAGES.phuHuynh),
  )
  .grant(coSo.reference().grant({ view: { data: ALL } }))
  .grant(lop.reference().grant({ view: { data: ALL } }))
  .grant(lopLich.reference().grant({ view: { data: ALL } }))
  .grant(hocVien.reference().grant({ view: { data: ALL } }))
  .grant(phuHuynh.reference().grant({ view: { data: ALL } }))
  .grant(lienKet.reference().grant({ view: { data: ALL } }))
  .build();

export const eduApiDoc = definePermissionSet('edu_api_doc')
  .title('NocoEdu - API chỉ đọc cho ứng dụng khác')
  .grant(
    ext.reference().grant({
      readStudents: { student: ALL, class: ALL },
      readParents: { parent: ALL },
    }),
  )
  .build();

export const EDU_PERMISSION_SETS = [
  eduQuanTri,
  eduQuanLyCoSo,
  eduHlv,
  eduKeToan,
  eduApiDoc,
] as const;
