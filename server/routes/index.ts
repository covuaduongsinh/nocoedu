import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import eduActions from './edu-actions.js';
import eduBaoCao from './edu-bao-cao.js';
import eduData from './edu-data.js';
import eduExt from './edu-ext.js';
import eduHoSoGv from './edu-ho-so-gv.js';
import eduHocPhi from './edu-hoc-phi.js';
import eduNhapCsv from './edu-nhap-csv.js';
import eduPhatSach from './edu-phat-sach.js';
import eduNoiDungBuoi from './edu-noi-dung-buoi.js';
import eduLienHe from './edu-lien-he.js';
import eduNhanXet from './edu-nhan-xet.js';
import eduCrm from './edu-crm.js';
import eduCongPhuHuynh from './edu-cong-phu-huynh.js';
import eduSaoLuu from './edu-sao-luu.js';
import eduXuatCsv from './edu-xuat-csv.js';
import eduTraCuu from './edu-tra-cuu.js';
import eduDoiSoat from './edu-doi-soat.js';
import eduImportUniversal from './edu-import-universal.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...eduData,
  ...eduActions,
  ...eduHocPhi,
  ...eduLienHe,
  ...eduNhanXet,
  ...eduCrm,
  ...eduCongPhuHuynh,
  ...eduSaoLuu,
  ...eduHoSoGv,
  ...eduPhatSach,
  ...eduNoiDungBuoi,
  ...eduNhapCsv,
  ...eduXuatCsv,
  ...eduBaoCao,
  ...eduTraCuu,
  ...eduDoiSoat,
  ...eduImportUniversal,
  ...eduExt,
];

export default routes;
