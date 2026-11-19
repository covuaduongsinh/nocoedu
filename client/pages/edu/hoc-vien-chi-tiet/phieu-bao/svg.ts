import { formatDayVn, type Notice, type NoticeSession } from './model.js';

/**
 * The notice as a picture: an SVG built by hand, 720 px wide, that the dialog shows and turns into a PNG.
 *
 * It is drawn here rather than captured from the page so that it looks the same on every machine, needs no library and
 * can be tested as text. **The colours are fixed on purpose**: the picture leaves the application (Zalo, a printout), so
 * it cannot follow the theme tokens or the dark mode, like the A4 sheet (`../in-phieu.tsx`). `BRAND` is the `--primary`
 * of the light theme (`client/theme/themes/compact.css`); change both together.
 *
 * SVG has no line wrapping: a line is cut by a number of characters (`wrap`), and the student's name is drawn smaller
 * when it is long. Text inside an `<img>` cannot use the page's web fonts, so the family is the system's.
 */
export interface NoticeLabels {
  readonly club: string;
  readonly title: string;
  /** `HS00007 · Lớp A · Kim Liên`. */
  readonly studentMeta: string;
  readonly termTitle: string;
  readonly paidOn: string;
  readonly bought: string;
  readonly attended: string;
  readonly left: string;
  readonly period: string;
  readonly sessionsTitle: string;
  readonly noSessions: string;
  readonly absentLegend: string;
  readonly excusedTitle: string;
  readonly overTitle: string;
  readonly conclusionTitle: string;
  readonly conclusionBody: string;
  readonly footer: string;
}

export interface NoticeSvg {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
}

const WIDTH = 720;
const PAD = 32;
const INNER = WIDTH - PAD * 2;
const FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const BRAND = '#2b3990';
const BRAND_SOFT = '#e4e8f7';
const INK = '#1b2033';
const MUTED = '#5c6478';
const LINE = '#d5daea';
const TILE = '#f3f5fb';
const PAPER = '#ffffff';

type Tone = 'danger' | 'warning' | 'success';
const TONES: Record<
  Tone,
  { readonly fill: string; readonly stroke: string; readonly text: string }
> = {
  danger: { fill: '#fdecec', stroke: '#f1a9a9', text: '#b42318' },
  warning: { fill: '#fff7e6', stroke: '#f0c36d', text: '#8a5200' },
  success: { fill: '#eaf6ee', stroke: '#9fd3b0', text: '#17663a' },
};

const STATUS_TONE: Record<Notice['status'], Tone> = {
  het: 'danger',
  vuot: 'danger',
  sap_het: 'warning',
  dang_hoc: 'success',
  da_sang_ky_moi: 'success',
};

const COLUMNS = 5;
const CHIP_GAP = 10;
const CHIP_WIDTH = (INNER - CHIP_GAP * (COLUMNS - 1)) / COLUMNS;
const CHIP_HEIGHT = 36;

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Cuts a sentence into lines of at most `max` characters, at spaces; a longer word keeps a line to itself. */
export function wrap(value: string, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/u).filter(Boolean)) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= max) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** `wrap` with lines of about the same length, so the last line is never one lonely word. */
export function wrapBalanced(value: string, max: number): string[] {
  const lines = wrap(value, max);
  if (lines.length < 2) return lines;
  for (
    let width = Math.ceil(value.length / lines.length);
    width < max;
    width += 1
  ) {
    const even = wrap(value, width);
    if (even.length === lines.length) return even;
  }
  return lines;
}

function text(
  x: number,
  y: number,
  value: string,
  options: {
    readonly size: number;
    readonly fill?: string;
    readonly weight?: number;
    readonly anchor?: 'start' | 'middle' | 'end';
    readonly spacing?: number;
    readonly opacity?: number;
  },
): string {
  const attributes = [
    `x="${round(x)}"`,
    `y="${round(y)}"`,
    `font-size="${options.size}"`,
    `fill="${options.fill ?? INK}"`,
    options.weight ? `font-weight="${options.weight}"` : '',
    options.anchor ? `text-anchor="${options.anchor}"` : '',
    options.spacing ? `letter-spacing="${options.spacing}"` : '',
    options.opacity ? `fill-opacity="${options.opacity}"` : '',
  ].filter(Boolean);
  return `<text ${attributes.join(' ')}>${escapeXml(value)}</text>`;
}

const round = (value: number): number => Math.round(value * 100) / 100;

function chips(
  sessions: readonly NoticeSession[],
  top: number,
  tone: Tone | null,
): { readonly markup: string; readonly height: number } {
  const parts = sessions.map((session, index) => {
    const x = PAD + (index % COLUMNS) * (CHIP_WIDTH + CHIP_GAP);
    const y = top + Math.floor(index / COLUMNS) * (CHIP_HEIGHT + CHIP_GAP);
    // An absence that was deducted stands out in amber inside a normal list; a list of its own keeps its tone.
    const colours = tone
      ? TONES[tone]
      : session.vang
        ? TONES.warning
        : { fill: PAPER, stroke: LINE, text: BRAND };
    const badge = tone || session.vang ? colours.stroke : BRAND_SOFT;
    return [
      `<rect x="${round(x)}" y="${y}" width="${round(CHIP_WIDTH)}" height="${CHIP_HEIGHT}" rx="8" fill="${colours.fill}" stroke="${colours.stroke}"/>`,
      `<circle cx="${round(x + 19)}" cy="${y + CHIP_HEIGHT / 2}" r="11" fill="${badge}"/>`,
      text(x + 19, y + CHIP_HEIGHT / 2 + 4, String(session.stt), {
        size: 11,
        weight: 700,
        fill: colours.text,
        anchor: 'middle',
      }),
      text(x + 36, y + CHIP_HEIGHT / 2 + 5, formatDayVn(session.ngay), {
        size: 14,
      }),
    ].join('');
  });
  const rows = Math.ceil(sessions.length / COLUMNS);
  return {
    markup: parts.join(''),
    height: rows === 0 ? 0 : rows * CHIP_HEIGHT + (rows - 1) * CHIP_GAP,
  };
}

/** The squares of a chessboard in the corner of the header, the club's motif. */
function chessboard(): string {
  const size = 14;
  const squares: string[] = [];
  for (let row = 0; row < 8; row += 1)
    for (let column = 0; column < 8; column += 1)
      if ((row + column) % 2 === 0)
        squares.push(
          `<rect x="${WIDTH - 8 * size + column * size}" y="${row * size}" width="${size}" height="${size}"/>`,
        );
  return `<g fill="${PAPER}" fill-opacity="0.1">${squares.join('')}</g>`;
}

export function noticeSvg(notice: Notice, labels: NoticeLabels): NoticeSvg {
  const out: string[] = [];
  const header = 112;
  out.push(
    `<rect width="${WIDTH}" height="${header}" fill="${BRAND}"/>`,
    chessboard(),
    text(PAD, 46, labels.club.toUpperCase(), {
      size: 14,
      fill: PAPER,
      weight: 600,
      spacing: 1.5,
      opacity: 0.85,
    }),
    text(PAD, 82, labels.title.toUpperCase(), {
      size: 26,
      fill: PAPER,
      weight: 700,
    }),
  );
  let y = header + 44;

  // The student. A long name is drawn smaller so it stays on one line.
  const name = notice.hocVien.hoTen;
  const nameSize = Math.max(
    18,
    Math.min(28, Math.floor(INNER / (Math.max(1, name.length) * 0.6))),
  );
  out.push(text(PAD, y, name, { size: nameSize, weight: 700 }));
  y += 26;
  if (labels.studentMeta !== '') {
    out.push(text(PAD, y, labels.studentMeta, { size: 15, fill: MUTED }));
    y += 22;
  }
  out.push(
    `<line x1="${PAD}" y1="${y}" x2="${WIDTH - PAD}" y2="${y}" stroke="${LINE}"/>`,
  );
  y += 34;

  // The term and the day it was paid.
  out.push(
    text(PAD, y, labels.termTitle, { size: 20, weight: 700, fill: BRAND }),
    text(WIDTH - PAD, y, labels.paidOn, {
      size: 15,
      fill: MUTED,
      anchor: 'end',
    }),
  );
  y += 18;

  // Bought, attended, left.
  const gap = 12;
  const tileWidth = (INNER - gap * 2) / 3;
  const tileHeight = 84;
  const { term } = notice;
  const tiles: readonly (readonly [string, string, string])[] = [
    [labels.bought, String(term.soBuoi), INK],
    [labels.attended, String(term.daDung), INK],
    [
      labels.left,
      String(term.conLai),
      term.conLai === 0 ? TONES.danger.text : INK,
    ],
  ];
  tiles.forEach(([label, value, colour], index) => {
    const x = PAD + index * (tileWidth + gap);
    out.push(
      `<rect x="${round(x)}" y="${y}" width="${round(tileWidth)}" height="${tileHeight}" rx="12" fill="${TILE}"/>`,
      text(x + 16, y + 28, label, { size: 13, fill: MUTED }),
      text(x + 16, y + 66, value, { size: 30, weight: 700, fill: colour }),
    );
  });
  y += tileHeight + 16;

  const progress = Math.max(0, Math.min(100, term.tienDo));
  out.push(
    `<rect x="${PAD}" y="${y}" width="${INNER}" height="10" rx="5" fill="${BRAND_SOFT}"/>`,
  );
  if (progress > 0)
    out.push(
      `<rect x="${PAD}" y="${y}" width="${round((INNER * progress) / 100)}" height="10" rx="5" fill="${BRAND}"/>`,
    );
  y += 34;
  out.push(text(PAD, y, labels.period, { size: 15 }));
  y += 40;

  // The sessions of the term.
  out.push(text(PAD, y, labels.sessionsTitle, { size: 16, weight: 700 }));
  y += 16;
  if (notice.cacBuoi.length === 0) {
    y += 8;
    out.push(text(PAD, y, labels.noSessions, { size: 14, fill: MUTED }));
    y += 12;
  } else {
    const grid = chips(notice.cacBuoi, y, null);
    out.push(grid.markup);
    y += grid.height;
  }
  if (notice.cacBuoi.some((session) => session.vang)) {
    y += 14;
    out.push(
      `<rect x="${PAD}" y="${y}" width="14" height="14" rx="3" fill="${TONES.warning.fill}" stroke="${TONES.warning.stroke}"/>`,
      text(PAD + 22, y + 12, labels.absentLegend, { size: 13, fill: MUTED }),
    );
    y += 14;
  }

  if (notice.nghiKhongTinh.length > 0) {
    y += 30;
    out.push(
      text(PAD, y, labels.excusedTitle, { size: 14, weight: 600, fill: MUTED }),
    );
    const days = notice.nghiKhongTinh.map(formatDayVn);
    for (let start = 0; start < days.length; start += 6) {
      y += 22;
      out.push(
        text(PAD, y, days.slice(start, start + 6).join(', '), {
          size: 14,
          fill: MUTED,
        }),
      );
    }
  }

  if (notice.hocThem.length > 0) {
    y += 36;
    out.push(
      text(PAD, y, labels.overTitle, {
        size: 16,
        weight: 700,
        fill: TONES.danger.text,
      }),
    );
    y += 16;
    const grid = chips(notice.hocThem, y, 'danger');
    out.push(grid.markup);
    y += grid.height;
  }

  // The conclusion.
  y += 28;
  const tone = TONES[STATUS_TONE[notice.status]];
  // 15 px text is about 7 px a character here, and the box holds 616 px.
  const body = wrapBalanced(labels.conclusionBody, 82);
  const boxHeight = 24 + 22 + body.length * 22 + (body.length > 0 ? 6 : 0) + 14;
  out.push(
    `<rect x="${PAD}" y="${y}" width="${INNER}" height="${boxHeight}" rx="14" fill="${tone.fill}" stroke="${tone.stroke}"/>`,
    text(PAD + 20, y + 38, labels.conclusionTitle, {
      size: 19,
      weight: 700,
      fill: tone.text,
    }),
  );
  body.forEach((line, index) => {
    out.push(text(PAD + 20, y + 66 + index * 22, line, { size: 15 }));
  });
  y += boxHeight + 34;

  out.push(
    text(WIDTH / 2, y, labels.footer, {
      size: 13,
      fill: MUTED,
      anchor: 'middle',
    }),
  );
  const height = y + 28;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" font-family="${FONT}">`,
    `<rect width="${WIDTH}" height="${height}" fill="${PAPER}"/>`,
    ...out,
    '</svg>',
  ].join('');
  return { svg, width: WIDTH, height };
}
