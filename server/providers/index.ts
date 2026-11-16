import EduAuthorizationProvider from './edu-authorization.js';
import EduLarkMappingProvider from './edu-lark-mapping.js';
import EduNhacHocPhiProvider from './edu-nhac-hoc-phi.js';
import EduSampleDataProvider from './edu-sample-data.js';
import NotificationManagementProvider from './notification-management.js';
import SubmissionProvider from './submission.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SubmissionProvider,
  NotificationManagementProvider,
  EduAuthorizationProvider,
  EduSampleDataProvider,
  EduLarkMappingProvider,
  EduNhacHocPhiProvider,
];

export default serviceProviders;
