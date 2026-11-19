/**
 * The browser side of the notice: the SVG as an address an `<img>` shows, as a PNG file, on the clipboard and in the
 * share sheet of a phone. Copying a picture and sharing a file exist only on HTTPS (or localhost) in recent browsers;
 * the `can…` functions say so beforehand, so the dialog explains instead of offering a button that does nothing.
 */

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The picture did not load.'));
    image.src = source;
  });
}

function canvasOf(
  image: HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas.');
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

/** Draws the SVG on a canvas, `scale` times its size so it stays sharp on a phone, and returns the PNG. */
export async function renderPng(
  svg: string,
  width: number,
  height: number,
  scale = 2,
): Promise<Blob> {
  const canvas = canvasOf(
    await loadImage(svgDataUrl(svg)),
    width * scale,
    height * scale,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('The canvas gave no PNG.')),
      'image/png',
    );
  });
}

/**
 * Fetches the VietQR code (the address the server built, on the public vietqr.io image service, which allows any
 * origin) and returns it as a PNG `data:` address with its size, ready to be drawn inside the notice. The service
 * answers with an SVG or a PNG depending on the bank; redrawing it on a canvas makes it a PNG either way. Nothing of
 * the session travels with the request (no cookie, no referrer).
 */
export async function loadQrImage(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok)
    throw new Error(`The QR service answered ${response.status}.`);
  const address = URL.createObjectURL(await response.blob());
  try {
    const image = await loadImage(address);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width === 0 || height === 0) throw new Error('The QR code is empty.');
    return {
      dataUrl: canvasOf(image, width, height).toDataURL('image/png'),
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(address);
  }
}

/**
 * The clipboard that takes a picture, or `null` where there is none (plain HTTP, an old browser). The one place of the
 * application that reaches for `navigator.clipboard` itself: text is copied with `copyText()` of `@nocobase/app-client`,
 * which also works on HTTP, but that helper copies text only and a picture has no HTTP fallback.
 */
function pictureClipboard(): Clipboard | null {
  if (
    typeof window === 'undefined' ||
    !window.isSecureContext ||
    typeof ClipboardItem === 'undefined'
  )
    return null;
  // eslint-disable-next-line no-restricted-properties -- copyText() cannot copy a picture; a missing API is reported by canCopyImage() and explained in the dialog.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  return typeof clipboard?.write === 'function' ? clipboard : null;
}

/** Whether this browser can put a picture on the clipboard (a secure context with the asynchronous Clipboard API). */
export function canCopyImage(): boolean {
  return pictureClipboard() !== null;
}

/** Puts the PNG on the clipboard; `false` when the browser refuses (no permission, the page lost focus). */
export async function copyImage(blob: Blob): Promise<boolean> {
  const clipboard = pictureClipboard();
  if (!clipboard) return false;
  try {
    await clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Whether the share sheet takes this file: phones do, most desktop browsers do not. */
export function canShareImage(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

/** Opens the share sheet with the picture and the message. Closing the sheet without sending is not a failure. */
export async function shareImage(
  file: File,
  message: string,
): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ files: [file], text: message });
    return 'shared';
  } catch (cause) {
    return cause instanceof DOMException && cause.name === 'AbortError'
      ? 'cancelled'
      : 'failed';
  }
}
