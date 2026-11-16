import { createHash } from 'node:crypto';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';

import { asText } from './names.js';
import { reminderThresholds } from './nguong-nhac.js';

/**
 * The daily tuition reminder.
 *
 * Who gets one: every active user who may view payments (accountants, branch managers, administrators), found by
 * asking the authorization service for that person's own decision; no role name is written here. What it lists: the
 * students that person may see, read through that person's own policies, so a branch manager is told about their
 * branches only. What it says: counts and student codes; never a name, a parent, a phone number or an amount, because
 * an inbox message is read on any screen.
 */
export const TUITION_REMINDER_ID = 'edu.nhac-hoc-phi';
/** Where a reminder leads: the list of who to collect from. */
export const TUITION_REMINDER_ROUTE = '/hoc-phi?tab=can-thu';
/** Codes written out per group; the rest are counted. */
const LISTED = 15;

export interface TuitionReminderInput {
  /** Codes of active students with no session left, or fewer than none. */
  readonly hetBuoi: readonly string[];
  /** Codes of active students at or below their branch's reminder threshold, with at least one session left. */
  readonly sapHet: readonly string[];
  /** How many students have a package that is not paid in full. */
  readonly conNo: number;
}

const listed = (codes: readonly string[]): string =>
  codes.length <= LISTED
    ? codes.join(', ')
    : `${codes.slice(0, LISTED).join(', ')} và ${codes.length - LISTED} học viên khác`;

/**
 * The words of a reminder. The one builder of the real message and of the preview in the template directory.
 * Vietnamese only: it is the club's working language, whatever language a recipient's screen uses.
 */
export function renderTuitionReminder(input: TuitionReminderInput): {
  title: string;
  body: string;
} {
  const parts: string[] = [];
  const lines: string[] = [];
  if (input.hetBuoi.length > 0) {
    parts.push(`${input.hetBuoi.length} hết buổi`);
    lines.push(
      `Hết buổi hoặc âm buổi (${input.hetBuoi.length}): ${listed(input.hetBuoi)}.`,
    );
  }
  if (input.sapHet.length > 0) {
    parts.push(`${input.sapHet.length} sắp hết buổi`);
    lines.push(
      `Sắp hết buổi (${input.sapHet.length}): ${listed(input.sapHet)}.`,
    );
  }
  if (input.conNo > 0) {
    parts.push(`${input.conNo} còn nợ học phí`);
    lines.push(`Còn nợ học phí: ${input.conNo} học viên.`);
  }
  lines.push('Mở Học phí › Cần thu để xem danh sách và liên hệ phụ huynh.');
  return {
    title: `Nhắc thu học phí: ${parts.join(', ')}`,
    body: lines.join('\n'),
  };
}

/** Whether there is anything to remind about. */
export const hasReminder = (input: TuitionReminderInput): boolean =>
  input.hetBuoi.length + input.sapHet.length + input.conNo > 0;

interface Deps {
  readonly database: DatabaseManager;
  readonly authz: AppAuthorization;
}

type Rows = readonly Record<string, unknown>[];

/** Reads every page of a query; a Repository query is awaited like a promise. */
async function readAll(
  page: (limit: number, offset: number) => PromiseLike<Rows>,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 20_000; offset += 100) {
    const batch = await page(100, offset);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

/** What each recipient is reminded about today; a person with nothing to collect is left out. */
export async function collectTuitionReminders(
  deps: Deps,
): Promise<{ userId: string; input: TuitionReminderInput }[]> {
  const { database, authz } = deps;
  const connection = database.connection();
  const thresholds = await reminderThresholds(connection);
  // Only a person who was given a permission set can hold the payment action, so those are the candidates.
  const assigned = new Set(
    (await authz.permissionSets.listAssignments())
      .filter((assignment) => assignment.subject.type === 'user')
      .map((assignment) => assignment.subject.id),
  );
  if (assigned.size === 0) return [];
  const users = await connection.query
    .selectFrom('user')
    .select(['id', 'disabledAt', 'deletedAt'])
    .where('id', 'in', [...assigned])
    .execute();
  const result: { userId: string; input: TuitionReminderInput }[] = [];
  for (const user of users) {
    if (user.disabledAt != null || user.deletedAt != null) continue;
    const userId = asText(user.id);
    // The identity is built here, from the database: the user and what every signed-in user is.
    const context = authz.for({
      principal: { type: 'user', id: userId },
      subjects: [{ type: 'authenticated', id: '*' }],
    });
    const policyOf = async (
      resource: string,
      collection: string,
    ): Promise<RepositoryPolicy | undefined> => {
      const decision = await context.authorize({
        resource: { type: 'composite', id: resource },
        action: 'view',
      });
      if (decision.effect === 'deny') return undefined;
      const policies = (
        decision.conditions as
          { database?: Readonly<Record<string, RepositoryPolicy>> } | undefined
      )?.database;
      return policies?.[collection];
    };
    const paymentPolicy = await policyOf('edu.thanhToan', 'eduThanhToan');
    const studentPolicy = await policyOf('edu.hocVien', 'eduHocVien');
    if (!paymentPolicy || !studentPolicy) continue;
    const packagePolicy = await policyOf('edu.goiHoc', 'eduGoiHoc');

    const low = (
      await readAll((limit, offset) =>
        database
          .repository('eduHocVien')
          .withPolicy(studentPolicy)
          .findMany({
            filter: (f) =>
              f.and([
                f.string('trangThai').eq('dang_hoc'),
                f.number('soBuoiConLai').lte(thresholds.highest),
              ]),
            sort: (s) => s.field('id').asc(),
            limit,
            offset,
          }),
      )
    ).filter((student) => thresholds.isLow(student));
    const codes = (rows: Rows): string[] =>
      rows.map((row) => asText(row.ma)).sort((a, b) => a.localeCompare(b));

    let conNo = 0;
    if (packagePolicy) {
      const paid = new Map<number, number>();
      for (const payment of await readAll((limit, offset) =>
        database
          .repository('eduThanhToan')
          .withPolicy(paymentPolicy)
          .findMany({ sort: (s) => s.field('id').asc(), limit, offset }),
      )) {
        if (payment.goiHocId == null) continue;
        const id = Number(payment.goiHocId);
        paid.set(id, (paid.get(id) ?? 0) + Number(payment.soTien));
      }
      const owing = new Set<number>();
      for (const pack of await readAll((limit, offset) =>
        database
          .repository('eduGoiHoc')
          .withPolicy(packagePolicy)
          .findMany({ sort: (s) => s.field('id').asc(), limit, offset }),
      )) {
        if (Number(pack.thanhTien) > (paid.get(Number(pack.id)) ?? 0))
          owing.add(Number(pack.hocVienId));
      }
      conNo = owing.size;
    }

    const input: TuitionReminderInput = {
      hetBuoi: codes(low.filter((row) => Number(row.soBuoiConLai) <= 0)),
      sapHet: codes(low.filter((row) => Number(row.soBuoiConLai) > 0)),
      conNo,
    };
    if (hasReminder(input)) result.push({ userId, input });
  }
  return result;
}

/** `2026-W47`: the ISO week of a calendar day. */
export function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Sends today's reminders through the in-app channel.
 *
 * A reminder is one logical message per person, week and content: the same list is told once a week, and again as
 * soon as it changes (somebody ran out, somebody paid). So the job can run every morning without filling an inbox
 * with the same words, and running it twice writes nothing twice.
 */
export async function sendTuitionReminders(
  deps: Deps & {
    readonly notification: NotificationService;
    /** The name of the configured in-app channel. */
    readonly channel: string;
  },
  today: string,
): Promise<{ sent: number; unchanged: number }> {
  let sent = 0;
  let unchanged = 0;
  for (const { userId, input } of await collectTuitionReminders(deps)) {
    const content = renderTuitionReminder(input);
    const digest = createHash('sha256')
      .update(`${content.title}\n${content.body}`)
      .digest('hex')
      .slice(0, 24);
    const idempotencyKey = `${TUITION_REMINDER_ID}:${userId}:${isoWeek(today)}:${digest}`;
    if (await deps.notification.getByIdempotencyKey(idempotencyKey)) {
      unchanged += 1;
      continue;
    }
    await deps.notification.send({
      idempotencyKey,
      source: { type: TUITION_REMINDER_ID, referenceId: today },
      messages: {
        [deps.channel]: {
          to: userId,
          title: content.title,
          body: content.body,
          target: { type: 'route', path: TUITION_REMINDER_ROUTE },
        },
      },
    });
    sent += 1;
  }
  return { sent, unchanged };
}
