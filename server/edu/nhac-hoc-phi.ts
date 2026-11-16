import { createHash } from 'node:crypto';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { NotificationService } from '@nocobase/app-plugin-notification/server';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';

import { asText } from './names.js';
import { reminderThresholds } from './nguong-nhac.js';
import { todayVn } from './so-du.js';

/**
 * The daily tuition reminder.
 *
 * Who is told: every active account that holds a permission set and is allowed `view` of both `edu.thanhToan` and
 * `edu.hocVien` (the administrator, the accountant and a branch manager; a coach holds neither). What each person is
 * told comes only from what that person's own policies let through, so a branch manager hears about their branches
 * and nobody learns of a student they may not see.
 *
 * What the message holds: counts and student codes, never a name, a phone number or an amount (a notification is kept
 * in the inbox and may be seen on a phone's lock screen). The language is Vietnamese only.
 */

/** Most student codes one line of the message lists; the rest are counted. */
export const MAX_CODES = 15;

/** Where the message leads: the "cần thu" tab of the tuition page. */
export const REMINDER_ROUTE = '/hoc-phi?tab=can-thu';

export interface ReminderPart {
  /** A number, or a placeholder such as `{{count}}` in the template directory's definition. */
  readonly count: number | string;
  readonly codes: readonly string[];
}

export interface ReminderParts {
  /** Sessions ran out (balance 0 or below). */
  readonly hetBuoi: ReminderPart;
  /** At or below the branch's threshold, but not yet out. */
  readonly sapHet: ReminderPart;
  /** A package not paid in full. */
  readonly conNo: ReminderPart;
}

export const partOf = (codes: readonly string[]): ReminderPart => ({
  count: codes.length,
  codes,
});

const isEmpty = (part: ReminderPart): boolean =>
  typeof part.count === 'number' && part.count === 0;

function line(label: string, part: ReminderPart): string | undefined {
  if (isEmpty(part)) return undefined;
  const shown = part.codes.slice(0, MAX_CODES);
  const more =
    typeof part.count === 'number' && part.count > shown.length
      ? ` và ${part.count - shown.length} học viên khác`
      : '';
  return `${label} (${part.count}): ${shown.join(', ')}${more}`;
}

/** The title and body of the reminder, or `undefined` when there is nothing to remind of. */
export function renderTuitionReminder(
  parts: ReminderParts,
): { title: string; body: string } | undefined {
  const lines = [
    line('Hết buổi', parts.hetBuoi),
    line('Sắp hết buổi', parts.sapHet),
    line('Còn nợ học phí', parts.conNo),
  ].filter((value): value is string => value !== undefined);
  if (lines.length === 0) return undefined;
  const all = [parts.hetBuoi, parts.sapHet, parts.conNo];
  const numeric = all.every((part) => typeof part.count === 'number');
  const total = numeric
    ? new Set(all.flatMap((part) => part.codes)).size
    : undefined;
  return {
    title:
      total === undefined
        ? 'Nhắc thu học phí: {{count}} học viên cần chú ý'
        : `Nhắc thu học phí: ${total} học viên cần chú ý`,
    body: [...lines, 'Mở mục Học phí › Cần thu để thu.'].join('\n'),
  };
}

/** An ISO week as `YYYY-Www`, from a calendar day `YYYY-MM-DD`. */
export function isoWeekOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  // The Thursday of the week decides the ISO year.
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - start.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** One message per person per week for the same content: a changed list is a new message, an unchanged one is not. */
export function reminderKey(
  userId: string,
  day: string,
  content: { title: string; body: string },
): string {
  const digest = createHash('sha256')
    .update(`${content.title}\n${content.body}`)
    .digest('hex')
    .slice(0, 12);
  return `edu.nhac-hoc-phi:${userId}:${isoWeekOf(day)}:${digest}`;
}

export interface ReminderDeps {
  readonly database: DatabaseManager;
  readonly authz: Pick<AppAuthorization, 'for' | 'permissionSets'>;
}

export interface Reminder {
  readonly userId: string;
  readonly parts: ReminderParts;
}

type Row = Record<string, unknown>;
type Policies = Readonly<Record<string, RepositoryPolicy>>;

const PAGE = 100;
/** A safety stop: more rows than this would not fit one message anyway. */
const MAX_ROWS = 50_000;

async function readAll(
  database: DatabaseManager,
  collection: string,
  policy: RepositoryPolicy,
  filter?: unknown,
): Promise<Row[]> {
  const repository = database
    .repository(collection)
    .withPolicy(policy) as unknown as {
    findMany(input: unknown): Promise<Row[]>;
  };
  const rows: Row[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const page = await repository.findMany({
      ...(filter ? { filter } : {}),
      sort: (s: { field: (n: string) => { asc: () => unknown } }) =>
        s.field('id').asc(),
      limit: PAGE,
      offset,
    });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** The database policies an identity holds for a composite action, or `undefined` when it is not allowed. */
async function policiesFor(
  context: ReturnType<ReminderDeps['authz']['for']>,
  resource: string,
  action: string,
): Promise<Policies | undefined> {
  const decision = await context.authorize({
    resource: { type: 'composite', id: resource },
    action,
  });
  const policies = decision.conditions?.database;
  return decision.effect === 'deny' || !policies ? undefined : policies;
}

/** Active accounts that hold at least one permission set. */
async function candidateUsers(deps: ReminderDeps): Promise<string[]> {
  const assignments = await deps.authz.permissionSets.listAssignments();
  const ids = [
    ...new Set(
      assignments
        .filter((assignment) => assignment.subject.type === 'user')
        .map((assignment) => assignment.subject.id),
    ),
  ];
  const active: string[] = [];
  const q = deps.database.connection().query;
  for (let i = 0; i < ids.length; i += 200) {
    const rows = await q
      .selectFrom('user')
      .select(['id', 'kind', 'disabledAt', 'deletedAt'])
      .where('id', 'in', ids.slice(i, i + 200))
      .execute();
    for (const row of rows) {
      if (
        asText(row.kind || 'person') === 'person' &&
        row.disabledAt == null &&
        row.deletedAt == null
      )
        active.push(asText(row.id));
    }
  }
  return active.sort();
}

/**
 * What one person would be told, from their own permissions; `undefined` when they may not see tuition and students,
 * and a reminder with nothing in it is `undefined` too.
 */
export async function reminderFor(
  deps: ReminderDeps,
  userId: string,
): Promise<Reminder | undefined> {
  const context = deps.authz.for({
    principal: { type: 'user', id: userId },
    subjects: [{ type: 'authenticated', id: '*' }],
  });
  const payments = await policiesFor(context, 'edu.thanhToan', 'view');
  const students = await policiesFor(context, 'edu.hocVien', 'view');
  if (!payments?.eduThanhToan || !students?.eduHocVien) return undefined;

  const rows = await readAll(
    deps.database,
    'eduHocVien',
    students.eduHocVien,
    (f: {
      and: (n: unknown[]) => unknown;
      string: (n: string) => { eq: (v: string) => unknown };
    }) => f.string('trangThai').eq('dang_hoc'),
  );
  const thresholds = await reminderThresholds(deps.database.connection());
  const hetBuoi: string[] = [];
  const sapHet: string[] = [];
  const byId = new Map<number, string>();
  for (const row of rows) {
    const code = asText(row.ma);
    byId.set(Number(row.id), code);
    const balance = Number(row.soBuoiConLai);
    if (balance <= 0) hetBuoi.push(code);
    else if (thresholds.isLow(row.coSoId, balance)) sapHet.push(code);
  }

  // Debt needs the packages as well: only a person who may see them is told of it.
  const packages = await policiesFor(context, 'edu.goiHoc', 'view');
  const conNo = new Set<string>();
  if (packages?.eduGoiHoc) {
    const paid = new Map<number, number>();
    for (const payment of await readAll(
      deps.database,
      'eduThanhToan',
      payments.eduThanhToan,
    )) {
      if (payment.goiHocId == null) continue;
      const id = Number(payment.goiHocId);
      paid.set(id, (paid.get(id) ?? 0) + Number(payment.soTien));
    }
    for (const pack of await readAll(
      deps.database,
      'eduGoiHoc',
      packages.eduGoiHoc,
    )) {
      const code = byId.get(Number(pack.hocVienId));
      if (code === undefined) continue;
      if (Number(pack.thanhTien) - (paid.get(Number(pack.id)) ?? 0) > 0)
        conNo.add(code);
    }
  }

  const byCode = (a: string, b: string): number => a.localeCompare(b);
  const parts: ReminderParts = {
    hetBuoi: partOf(hetBuoi.sort(byCode)),
    sapHet: partOf(sapHet.sort(byCode)),
    conNo: partOf([...conNo].sort(byCode)),
  };
  return renderTuitionReminder(parts) ? { userId, parts } : undefined;
}

/** Every reminder due today, one per person. */
export async function collectTuitionReminders(
  deps: ReminderDeps,
): Promise<Reminder[]> {
  const reminders: Reminder[] = [];
  for (const userId of await candidateUsers(deps)) {
    const reminder = await reminderFor(deps, userId);
    if (reminder) reminders.push(reminder);
  }
  return reminders;
}

export interface SendResult {
  readonly people: number;
  readonly sent: number;
  readonly repeated: number;
}

/** Sends today's reminders to the inbox. Running it again the same day, or the same week with the same lists, sends nothing new. */
export async function sendTuitionReminders(
  deps: ReminderDeps & {
    readonly notification: Pick<NotificationService, 'send'>;
    /** The name of the in-app channel. */
    readonly channel: string;
    readonly now?: Date;
  },
): Promise<SendResult> {
  const day = todayVn(deps.now);
  let sent = 0;
  let repeated = 0;
  const reminders = await collectTuitionReminders(deps);
  for (const reminder of reminders) {
    const content = renderTuitionReminder(reminder.parts);
    if (!content) continue;
    const result = await deps.notification.send({
      idempotencyKey: reminderKey(reminder.userId, day, content),
      source: { type: 'edu.nhac-hoc-phi', referenceId: reminder.userId },
      messages: {
        [deps.channel]: {
          to: reminder.userId,
          title: content.title,
          body: content.body,
          target: { type: 'route', path: REMINDER_ROUTE },
        },
      },
    });
    if (result.deduplicated) repeated += 1;
    else sent += 1;
  }
  return { people: reminders.length, sent, repeated };
}
