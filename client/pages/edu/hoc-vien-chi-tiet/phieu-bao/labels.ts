import { termLabel } from '../terms.js';
import { formatDayVn, type Notice } from './model.js';
import type { NoticeLabels } from './svg.js';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** When the term ran: both ends once it is used up, the start while it is being used. */
function period(t: Translate, notice: Notice): string {
  if (notice.batDau === null) return t('edu.phieuBao.card.periodNone');
  return notice.ketThuc === null
    ? t('edu.phieuBao.card.periodOpen', { start: formatDayVn(notice.batDau) })
    : t('edu.phieuBao.card.period', {
        start: formatDayVn(notice.batDau),
        end: formatDayVn(notice.ketThuc),
      });
}

function conclusion(
  t: Translate,
  notice: Notice,
): { readonly title: string; readonly body: string } {
  const values = {
    count: notice.status === 'vuot' ? notice.soBuoiVuot : notice.conLai,
    term: notice.kyTiepTheo ? termLabel(t, notice.kyTiepTheo) : '',
  };
  return {
    title: t(`edu.phieuBao.status.${notice.status}.title`, values),
    body: t(`edu.phieuBao.status.${notice.status}.body`, values),
  };
}

/** Every piece of text of the picture, in the language of the person who makes it. */
export function noticeLabels(t: Translate, notice: Notice): NoticeLabels {
  const club = t('edu.hoSo.print.club');
  const { title, body } = conclusion(t, notice);
  return {
    club,
    title: t('edu.phieuBao.card.title'),
    studentMeta: [
      notice.hocVien.ma,
      notice.hocVien.lopTen,
      notice.hocVien.coSoTen,
    ]
      .filter(Boolean)
      .join(' · '),
    termTitle: termLabel(t, notice.term),
    paidOn: t('edu.hoSo.kyNgay', { date: formatDayVn(notice.term.ngayMua) }),
    bought: t('edu.phieuBao.card.bought'),
    attended: t('edu.phieuBao.card.attended'),
    left: t('edu.phieuBao.card.left'),
    period: period(t, notice),
    sessionsTitle: t('edu.phieuBao.card.sessions', {
      count: notice.cacBuoi.length,
    }),
    noSessions: t('edu.phieuBao.card.noSessions'),
    absentLegend: t('edu.phieuBao.card.absent'),
    excusedTitle: t('edu.phieuBao.card.excused', {
      count: notice.nghiKhongTinh.length,
    }),
    overTitle: t('edu.phieuBao.card.over', { count: notice.hocThem.length }),
    conclusionTitle: title,
    conclusionBody: body,
    footer: t('edu.phieuBao.card.footer', {
      date: formatDayVn(notice.ngayLap),
      club,
    }),
  };
}

/** The message that goes with the picture; the person may edit it before copying. It stands on its own without it. */
export function noticeMessage(t: Translate, notice: Notice): string {
  const { title, body } = conclusion(t, notice);
  const days = (list: readonly string[]): string =>
    list.map(formatDayVn).join(', ');
  const lines = [
    t('edu.phieuBao.msg.greeting', { name: notice.hocVien.hoTen }),
    t('edu.phieuBao.msg.intro', {
      club: t('edu.hoSo.print.club'),
      term: termLabel(t, notice.term),
    }),
    t('edu.phieuBao.msg.paid', { date: formatDayVn(notice.term.ngayMua) }),
    t('edu.phieuBao.msg.count', {
      used: notice.term.daDung,
      total: notice.term.soBuoi,
      left: notice.term.conLai,
    }),
    `- ${period(t, notice)}`,
  ];
  if (notice.cacBuoi.length > 0)
    lines.push(
      t('edu.phieuBao.msg.days', {
        days: days(notice.cacBuoi.map((session) => session.ngay)),
      }),
    );
  if (notice.nghiKhongTinh.length > 0)
    lines.push(
      t('edu.phieuBao.msg.excused', { days: days(notice.nghiKhongTinh) }),
    );
  if (notice.hocThem.length > 0)
    lines.push(
      t('edu.phieuBao.msg.over', {
        days: days(notice.hocThem.map((session) => session.ngay)),
      }),
    );
  lines.push('', `${title}. ${body}`, t('edu.phieuBao.msg.thanks'));
  return lines.join('\n');
}
