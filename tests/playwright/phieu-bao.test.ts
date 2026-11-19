/// <reference lib="dom" />
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * The notice of a tuition term in a real browser (`tests/fixtures/phieu-bao.tsx`): what jsdom cannot show. The picture
 * is really drawn and turned into a PNG, the PNG really reaches the clipboard, the VietQR code is really fetched from
 * the public image service, and the dialog fits a phone in both themes.
 *
 * Like the other fixtures, it needs the application's Vite: start `pnpm dev`, set `APP_URL` to the `Local:` address it
 * prints and run `pnpm exec playwright test tests/playwright/phieu-bao.test.ts` (`pnpm exec playwright install
 * chromium` once, or a configuration with `use.channel: 'msedge'` for the installed Edge). The page calls no backend.
 * `PHIEU_BAO_EVIDENCE_DIR` keeps screenshots. The VietQR case needs the internet and is skipped with `PHIEU_BAO_OFFLINE`.
 */
const applicationUrl = process.env.APP_URL;
test.skip(!applicationUrl, 'Set APP_URL to the running application entry.');
const fixture = `${applicationUrl?.replace(/\/$/, '')}/tests/fixtures/phieu-bao.html`;

async function screenshot(page: Page, name: string) {
  if (process.env.PHIEU_BAO_EVIDENCE_DIR) {
    await page.screenshot({
      path: path.join(process.env.PHIEU_BAO_EVIDENCE_DIR, `${name}.png`),
    });
  }
}

const picture = (page: Page) => page.getByRole('img', { name: /^Phiếu báo/u });

/** The preview is an SVG the browser really decoded: 720 wide, as tall as the notice. */
async function pictureSize(page: Page) {
  return picture(page).evaluate((image) => {
    const element = image as HTMLImageElement;
    return {
      complete: element.complete,
      width: element.naturalWidth,
      height: element.naturalHeight,
    };
  });
}

test('draws the notice, makes the PNG and puts it on the clipboard', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Clipboard permissions are Chromium’s.',
  );
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixture);
  await expect(
    page.getByRole('heading', { name: 'Phiếu báo kỳ học phí' }),
  ).toBeVisible();
  await expect(picture(page)).toBeVisible();
  await expect.poll(async () => (await pictureSize(page)).width).toBe(720);
  expect((await pictureSize(page)).height).toBeGreaterThan(900);

  // The PNG is made in the background; the buttons wait for it.
  const copy = page.getByRole('button', { name: 'Sao chép ảnh' });
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(
    page.getByText('Đã sao chép ảnh. Dán vào Zalo để gửi phụ huynh.'),
  ).toBeVisible();
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item!.getType('image/png');
    const bitmap = await createImageBitmap(blob);
    return { types: item!.types, width: bitmap.width, height: bitmap.height };
  });
  expect(copied.types).toContain('image/png');
  // Twice the size of the picture, so it stays sharp on a phone.
  expect(copied.width).toBe(1440);
  expect(copied.height).toBeGreaterThan(1800);

  // The file a person downloads carries the code of the student and the number of the term.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải ảnh' }).click();
  expect((await download).suggestedFilename()).toBe(
    'phieu-bao-HS00007-ky-1.png',
  );

  // The message is copied as text.
  await page.getByRole('button', { name: 'Sao chép lời nhắn' }).click();
  await expect(page.getByText('Đã sao chép lời nhắn.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'Kính gửi phụ huynh em Học viên Mẫu Số Bảy,',
  );
  await screenshot(page, 'desktop-light');
});

test('marks that the parent was told and reads the student file again only on closing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixture);
  await expect(
    page.getByText('Chưa đánh dấu đã báo cho kỳ này.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Đánh dấu đã báo' }).click();
  await expect(
    page.getByText(/^Đã báo phụ huynh ngày \d{2}\/\d{2}\/\d{4}\.$/u),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Đã đánh dấu hôm nay' }),
  ).toBeDisabled();
  const sent = await page.evaluate(() =>
    (
      window as unknown as {
        fixtureCalls: { path: string; json: unknown }[];
      }
    ).fixtureCalls.filter((call) => call.path === 'phieuBao/ghi'),
  );
  expect(sent).toEqual([
    { path: 'phieuBao/ghi', json: { hocVienId: 7, goiHocId: 41 } },
  ]);
  await expect(page.getByTestId('state')).toContainText('đọc lại hồ sơ 0 lần');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('state')).toContainText(
    'đã đóng · đọc lại hồ sơ 1 lần',
  );
});

test('offers no mark button to a person who may not collect tuition', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${fixture}?role=xem`);
  await expect(page.getByRole('button', { name: 'Tải ảnh' })).toBeEnabled();
  await expect(
    page.getByText('Chưa đánh dấu đã báo cho kỳ này.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Đánh dấu đã báo' }),
  ).toHaveCount(0);
});

for (const dark of [false, true]) {
  for (const width of [412, 390, 375]) {
    test(`fits a phone ${width}px wide in the ${dark ? 'dark' : 'light'} theme`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 667 });
      await page.goto(`${fixture}${dark ? '?dark' : ''}`);
      const panel = page.getByRole('dialog');
      await expect(panel).toBeVisible();
      await expect(picture(page)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tải ảnh' })).toBeEnabled();
      const box = (await panel.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(667);
      // Nothing makes the page or the dialog scroll sideways.
      expect(
        await page.evaluate(() => {
          const root = document.documentElement;
          const dialog = document.querySelector('[role=dialog]')!;
          return (
            root.scrollWidth <= root.clientWidth &&
            dialog.scrollWidth <= dialog.clientWidth + 1
          );
        }),
      ).toBe(true);
      // Every action can be reached: the dialog scrolls and its buttons stay inside it.
      for (const name of ['Tải ảnh', 'Sao chép lời nhắn', 'Đánh dấu đã báo']) {
        const button = page.getByRole('button', { name });
        await button.scrollIntoViewIfNeeded();
        const rect = (await button.boundingBox())!;
        expect(rect.x).toBeGreaterThanOrEqual(box.x);
        expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width + 1);
      }
      await screenshot(page, `phone-${width}-${dark ? 'dark' : 'light'}`);
    });
  }
}

test('fetches the VietQR code of the next term and draws it into the picture', async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.PHIEU_BAO_OFFLINE),
    'Needs the public VietQR image service.',
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${fixture}?bank`);
  const box = page.getByRole('checkbox', {
    name: 'Kèm mã QR chuyển khoản kỳ tiếp theo',
  });
  // The student ran out and attended beyond the term: the code is on by default.
  await expect(box).toBeChecked();
  const before = (await pictureSize(page)).height;
  await expect
    .poll(async () => (await pictureSize(page)).height, { timeout: 30_000 })
    .toBeGreaterThan(before + 200);
  const source = decodeURIComponent(
    (await picture(page).getAttribute('src')) ?? '',
  );
  expect(source).toContain('Chuyển khoản học phí kỳ tiếp theo');
  expect(source).toContain('3.000.000 đ');
  expect(source).toContain('href="data:image/png;base64,');
  await expect(page.getByLabel('Lời nhắn gửi kèm')).toHaveValue(
    /Nội dung chuyển khoản: HP HS00007/u,
  );
  // The picture with the code in it still becomes a PNG: the canvas is not tainted by the code.
  await expect(page.getByRole('button', { name: 'Tải ảnh' })).toBeEnabled();
  await screenshot(page, 'desktop-qr');

  await box.uncheck();
  await expect.poll(async () => (await pictureSize(page)).height).toBe(before);
});
