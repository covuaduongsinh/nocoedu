import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { createAppTest } from '@nocobase/app-testing/server';
import { databaseManagerToken } from '@nocobase/db';
import { expect } from 'vitest';

import {
  collectTuitionReminders,
  isoWeek,
  renderTuitionReminder,
  sendTuitionReminders,
} from '../../server/edu/nhac-hoc-phi.js';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  adminSession,
  idByMa,
  post,
  seedSchool,
  userWithRole,
} from '../helpers/edu.js';

// The daily tuition reminder: who is told, about which students, and how often. Students and amounts are made up.

const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      trustedOrigins: ['http://localhost'],
    },
    users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
    notification: { channels: { inbox: { type: 'in-app' } } },
  },
});

test('the words of a reminder carry counts and codes, and count what is not written out', () => {
  expect(
    renderTuitionReminder({ hetBuoi: ['HS-1'], sapHet: [], conNo: 0 }),
  ).toEqual({
    title: 'Nhắc thu học phí: 1 hết buổi',
    body: 'Hết buổi hoặc âm buổi (1): HS-1.\nMở Học phí › Cần thu để xem danh sách và liên hệ phụ huynh.',
  });
  const many = renderTuitionReminder({
    hetBuoi: [],
    sapHet: Array.from({ length: 18 }, (_, index) => `HS-${index + 1}`),
    conNo: 3,
  });
  expect(many.title).toBe(
    'Nhắc thu học phí: 18 sắp hết buổi, 3 còn nợ học phí',
  );
  expect(many.body).toContain('HS-15 và 3 học viên khác.');
  expect(many.body).not.toContain('HS-16');
  expect(many.body).toContain('Còn nợ học phí: 3 học viên.');
  // Weeks follow the calendar the club works by: Monday starts one.
  expect([isoWeek('2026-11-15'), isoWeek('2026-11-16')]).toEqual([
    '2026-W46',
    '2026-W47',
  ]);
  expect(isoWeek('2027-01-01')).toBe('2026-W53');
});

test('those who may view payments are reminded about the students in their own scope, once per change', async ({
  app,
  testApp,
  connection,
}) => {
  const admin = await adminSession(testApp);
  const hlvA = await userWithRole(testApp, admin, 'nt-hlv-a', 'edu_hlv');
  const hlvB = await userWithRole(testApp, admin, 'nt-hlv-b', 'edu_hlv');
  const managerA = await userWithRole(
    testApp,
    admin,
    'nt-ql-a',
    'edu_quan_ly_co_so',
  );
  const keToan = await userWithRole(testApp, admin, 'nt-kt', 'edu_ke_toan');
  const ids = await seedSchool(connection, {
    hlvA: hlvA.id,
    hlvB: hlvB.id,
    managerA: managerA.id,
  });
  // Branch A also has a student with two sessions left, one with three, and one who stopped with none.
  for (const [ma, soBuoiConLai, trangThai] of [
    ['HS-A2', 2, 'dang_hoc'],
    ['HS-A3', 3, 'dang_hoc'],
    ['HS-A4', 0, 'nghi_hoc'],
  ] as const) {
    await connection.query
      .insertInto('eduHocVien')
      .values({
        ma,
        hoTen: `Học viên Mẫu ${ma}`,
        namSinh: 2016,
        levelKey: 'tot',
        levelOrder: 1,
        lopId: ids.lopA,
        coSoId: ids.coSoA,
        soBuoiConLai,
        trangThai,
      })
      .execute();
  }
  const deps = {
    database: app.container.resolve(databaseManagerToken),
    authz: app.container.resolve(authorizationToken),
  };
  const byUser = async () =>
    new Map(
      (await collectTuitionReminders(deps)).map((entry) => [
        entry.userId,
        entry.input,
      ]),
    );

  let reminders = await byUser();
  // A coach holds no payment action: nothing about tuition reaches a coach.
  expect(reminders.has(hlvA.id)).toBe(false);
  expect(reminders.has(hlvB.id)).toBe(false);
  // The accountant sees every branch; a student who stopped is not chased, and three sessions left is not low yet.
  expect(reminders.get(keToan.id)).toEqual({
    hetBuoi: ['HS-A', 'HS-B'],
    sapHet: ['HS-A2'],
    conNo: 0,
  });
  // The manager of branch A is told about branch A only.
  expect(reminders.get(managerA.id)).toEqual({
    hetBuoi: ['HS-A'],
    sapHet: ['HS-A2'],
    conNo: 0,
  });
  // The administrator who set the application up sees everything too.
  expect(reminders.get(admin.user.id)).toEqual(reminders.get(keToan.id));

  // Branch A starts reminding at three sessions.
  await connection.query
    .updateTable('eduCoSo')
    .set({ nguongNhacBuoi: 3 })
    .where('id', '=', ids.coSoA)
    .execute();
  reminders = await byUser();
  expect(reminders.get(managerA.id)?.sapHet).toEqual(['HS-A2', 'HS-A3']);
  // The same threshold decides the list on the tuition page.
  const listed = (
    (await (await post(managerA.session, '/soDu/canhBao', {})).json()) as {
      data: { ma: string }[];
    }
  ).data.map((row) => row.ma);
  expect(listed.sort()).toEqual(['HS-A', 'HS-A2', 'HS-A3']);

  const notification = app.container.resolve(notificationServiceToken);
  const send = (day: string) =>
    sendTuitionReminders({ ...deps, notification, channel: 'inbox' }, day);
  expect(await send('2026-11-16')).toEqual({ sent: 3, unchanged: 0 });
  // The next mornings of that week: the same lists, so nobody is told again.
  expect(await send('2026-11-17')).toEqual({ sent: 0, unchanged: 3 });
  // A package is sold to HS-A and half paid: the lists change for those who see HS-A, and they are told.
  const pack = (
    (await (
      await post(keToan.session, '/goiHoc/taoMoi', {
        hocVienId: ids.hocVienA,
        soBuoi: 10,
        donGia: 100000,
      })
    ).json()) as { data: { id: number } }
  ).data;
  await post(keToan.session, '/thanhToan/ghiNhan', {
    goiHocId: pack.id,
    soTien: 500000,
    hinhThuc: 'tien_mat',
  });
  expect((await byUser()).get(managerA.id)).toEqual({
    hetBuoi: [],
    sapHet: ['HS-A2', 'HS-A3'],
    conNo: 1,
  });
  expect(await send('2026-11-18')).toEqual({ sent: 3, unchanged: 0 });
  // A new week repeats what is still open.
  expect(await send('2026-11-23')).toEqual({ sent: 3, unchanged: 0 });

  // What arrives in an inbox: counts and codes, a link to the list, and no name of a child.
  const inbox = async (session: typeof admin) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await session.fetch('/notificationInApp/messages');
      const body = (await response.json()) as {
        data: { title: string; body: string }[];
      };
      if (body.data.length > 0) return body.data;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return [];
  };
  const received = await inbox(managerA.session);
  expect(received.map((message) => message.title)).toContain(
    'Nhắc thu học phí: 1 hết buổi, 2 sắp hết buổi',
  );
  const text = JSON.stringify(received);
  expect(text).toContain('HS-A2');
  expect(text).toContain('/hoc-phi?tab=can-thu');
  expect(text).not.toContain('Học viên Mẫu');
  expect(text).not.toContain('HS-B');
  const coachInbox = await hlvA.session.fetch('/notificationInApp/messages');
  expect(((await coachInbox.json()) as { data: unknown[] }).data).toEqual([]);
  expect(await idByMa(connection, 'eduHocVien', 'HS-A2')).toBeGreaterThan(0);
});

test('the reminder is listed in the template directory with a synthetic preview', async ({
  app,
  testApp,
}) => {
  expect(app.config.get('client.notificationTemplates.tuitionReminder')).toBe(
    true,
  );
  const admin = await adminSession(testApp);
  const list = (await (
    await admin.fetch('/notifications/templates')
  ).json()) as { data: { id: string; channels: unknown[] }[] };
  expect(list.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'edu.nhac-hoc-phi',
        channels: [
          { name: 'inbox', type: 'in-app', configured: true, enabled: true },
        ],
      }),
    ]),
  );
  const preview = await admin.fetch(
    '/notifications/templates/edu.nhac-hoc-phi/preview',
    {
      method: 'POST',
      headers: {
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ locale: 'vi-VN' }),
    },
  );
  expect(preview.status).toBe(200);
  const shown = JSON.stringify(await preview.json());
  expect(shown).toContain('HS-MAU-01');
  expect(shown).toContain('Nhắc thu học phí: 2 hết buổi, 3 sắp hết buổi');
});
