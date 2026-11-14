import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import eduActions from './edu-actions.js';
import eduBaoCao from './edu-bao-cao.js';
import eduData from './edu-data.js';
import eduExt from './edu-ext.js';
import eduHocPhi from './edu-hoc-phi.js';
import eduNhapCsv from './edu-nhap-csv.js';
import eduPhatSach from './edu-phat-sach.js';
import eduNoiDungBuoi from './edu-noi-dung-buoi.js';
import eduNhanXet from './edu-nhan-xet.js';
import eduXuatCsv from './edu-xuat-csv.js';
import eduTraCuu from './edu-tra-cuu.js';

const routes: readonly AppRouteContribution<Application>[] = [
  ...eduData,
  ...eduActions,
  ...eduHocPhi,
  ...eduNhanXet,
  ...eduPhatSach,
  ...eduNoiDungBuoi,
  ...eduNhapCsv,
  ...eduXuatCsv,
  ...eduBaoCao,
  ...eduTraCuu,
  ...eduExt,
];

export default routes;
