import { expect } from 'vitest';

import { eduLarkMappingToken } from '../../server/providers/edu-lark-mapping.js';
import { adminSession, test } from '../helpers/edu.js';

test('the Lark mapping service resolves and the provider opens no route', async ({
  app,
  testApp,
}) => {
  const service = app.container.resolve(eduLarkMappingToken);
  expect(service.normalize.toVnMobile('0912345678')).toEqual({
    ok: true,
    value: '0912345678',
  });
  expect(service.balance.recomputeBalance(null, [], false).warnings).toEqual([
    'KHONG_CO_SO_DU',
  ]);
  expect(service.rules.ATTENDANCE_SOURCE).toBe('base');

  // The provider adds no HTTP endpoint, not even for an administrator.
  const admin = await adminSession(testApp);
  for (const path of ['/larkMapping', '/lark', '/larkImport']) {
    expect((await admin.fetch(path)).status).toBe(404);
  }
});
