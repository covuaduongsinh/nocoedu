import { definePermissionSet } from '@nocobase/authorization/permission-sets';

import { PAGES } from '../../server/edu/pages.js';
import {
  baoCao,
  buoiHoc,
  coSo,
  coSoQuanLy,
  diemDanh,
  dongY,
  ext,
  goiHoc,
  hocVien,
  lienKet,
  lop,
  lopLich,
  nhanXet,
  phatSach,
  phuHuynh,
  sach,
  soDu,
  thanhToan,
  tuyenSinh,
  hoSoGv,
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

// The books page was added after the first seed ran: it and its grant are the last ones of every set that has them
// (`202611130003_edu_sach_grant` appends them in this order).
const everyPage = Object.entries(PAGES)
  .filter(
    ([key]) =>
      key !== 'sach' &&
      key !== 'phatSach' &&
      key !== 'tuyenSinh' &&
      key !== 'hoSoGv',
  )
  .map(([, id]) => page(id));
const sachPage = page(PAGES.sach);
// The handouts page came after the books page: `202611140002_edu_phat_sach_grant` appends it after the books grants.
const phatSachPage = page(PAGES.phatSach);
// The admissions page came last: `202611140004_edu_tuyen_sinh_grant`.
const tuyenSinhPage = page(PAGES.tuyenSinh);
// The coach profile page is the last: `202611140005_edu_ho_so_gv_grant` (administrator only).
const hoSoGvPage = page(PAGES.hoSoGv);

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
      import: {
        data: ALL,
        branches: ALL,
        classes: ALL,
        parents: ALL,
      },
      export: {
        data: ALL,
        branches: ALL,
        classes: ALL,
        parents: ALL,
        links: ALL,
      },
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
  .grant(
    buoiHoc.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(
    diemDanh.reference().grant({ view: { data: ALL }, record: { data: ALL } }),
  )
  .grant(
    goiHoc.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(
    thanhToan.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(soDu.reference().grant({ view: { data: ALL } }))
  .grant(
    nhanXet.reference().grant({ view: { data: ALL }, write: { data: ALL } }),
  )
  .grant(baoCao.reference().grant({ export: { data: ALL } }))
  .grant(sachPage)
  .grant(sach.reference().grant({ view: { data: ALL }, manage: { data: ALL } }))
  .grant(phatSachPage)
  .grant(
    phatSach.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(tuyenSinhPage)
  .grant(
    tuyenSinh.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(hoSoGvPage)
  .grant(
    hoSoGv.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
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
      import: {
        data: MY_BRANCHES,
        branches: MY_BRANCHES,
        classes: MY_BRANCHES,
        parents: MY_BRANCHES,
      },
      export: {
        data: MY_BRANCHES,
        branches: MY_BRANCHES,
        classes: MY_BRANCHES,
        parents: MY_BRANCHES,
        links: MY_BRANCHES,
      },
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
  .grant(
    buoiHoc
      .reference()
      .grant({ view: { data: MY_BRANCHES }, manage: { data: MY_BRANCHES } }),
  )
  .grant(
    diemDanh
      .reference()
      .grant({ view: { data: MY_BRANCHES }, record: { data: MY_BRANCHES } }),
  )
  .grant(
    goiHoc
      .reference()
      .grant({ view: { data: MY_BRANCHES }, manage: { data: MY_BRANCHES } }),
  )
  .grant(
    thanhToan
      .reference()
      .grant({ view: { data: MY_BRANCHES }, manage: { data: MY_BRANCHES } }),
  )
  .grant(soDu.reference().grant({ view: { data: MY_BRANCHES } }))
  .grant(
    nhanXet.reference().grant({
      view: { data: MY_BRANCHES },
      write: { data: MY_BRANCHES },
    }),
  )
  .grant(baoCao.reference().grant({ export: { data: MY_BRANCHES } }))
  .grant(sachPage)
  .grant(sach.reference().grant({ view: { data: ALL } }))
  .grant(phatSachPage)
  .grant(
    phatSach.reference().grant({
      view: { data: MY_BRANCHES },
      manage: { data: MY_BRANCHES },
    }),
  )
  .grant(tuyenSinhPage)
  .grant(
    tuyenSinh.reference().grant({
      view: { data: MY_BRANCHES },
      manage: { data: MY_BRANCHES },
    }),
  )
  .build();

export const eduHlv = definePermissionSet('edu_hlv')
  .title('NocoEdu - Huấn luyện viên')
  .grant(
    page(PAGES.lop),
    page(PAGES.hocVien),
    page(PAGES.diemDanh),
    page(PAGES.nhanXet),
    page(PAGES.baoCao),
  )
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
  .grant(
    buoiHoc
      .reference()
      .grant({ view: { data: MY_CLASSES }, manage: { data: MY_CLASSES } }),
  )
  .grant(
    diemDanh
      .reference()
      .grant({ view: { data: MY_CLASSES }, record: { data: MY_CLASSES } }),
  )
  .grant(soDu.reference().grant({ view: { data: MY_CLASSES } }))
  .grant(
    nhanXet.reference().grant({
      view: { data: MY_CLASSES },
      write: { data: MY_CLASSES },
    }),
  )
  .grant(sachPage)
  .grant(sach.reference().grant({ view: { data: ALL } }))
  .build();

export const eduKeToan = definePermissionSet('edu_ke_toan')
  .title('NocoEdu - Kế toán')
  .grant(
    page(PAGES.coSo),
    page(PAGES.lop),
    page(PAGES.hocVien),
    page(PAGES.phuHuynh),
    page(PAGES.hocPhi),
    page(PAGES.baoCao),
  )
  .grant(coSo.reference().grant({ view: { data: ALL } }))
  .grant(lop.reference().grant({ view: { data: ALL } }))
  .grant(lopLich.reference().grant({ view: { data: ALL } }))
  .grant(hocVien.reference().grant({ view: { data: ALL } }))
  .grant(phuHuynh.reference().grant({ view: { data: ALL } }))
  .grant(lienKet.reference().grant({ view: { data: ALL } }))
  .grant(buoiHoc.reference().grant({ view: { data: ALL } }))
  .grant(diemDanh.reference().grant({ view: { data: ALL } }))
  .grant(
    goiHoc.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(
    thanhToan.reference().grant({ view: { data: ALL }, manage: { data: ALL } }),
  )
  .grant(soDu.reference().grant({ view: { data: ALL } }))
  .grant(baoCao.reference().grant({ export: { data: ALL } }))
  .grant(sachPage)
  .grant(sach.reference().grant({ view: { data: ALL } }))
  .grant(phatSachPage)
  .grant(phatSach.reference().grant({ view: { data: ALL } }))
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
