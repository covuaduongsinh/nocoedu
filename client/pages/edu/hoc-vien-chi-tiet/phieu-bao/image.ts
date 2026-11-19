/**
 * The browser side of the notice: the SVG as an address an `<img>` shows, as a PNG file, on the clipboard and in the
 * share sheet of a phone. Copying a picture and sharing a file exist only on HTTPS (or localhost) in recent browsers;
 * the `can…` functions say so beforehand, so the dialog explains instead of offering a button that does nothing.
 */

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Draws the SVG on a canvas, `scale` times its size so it stays sharp on a phone, and returns the PNG. */
export function renderPng(
  svg: string,
  width: number,
  height: number,
  scale = 2,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('No 2D canvas.'));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('The canvas gave no PNG.')),
        'image/png',
      );
    };
    image.onerror = () => reject(new Error('The picture did not load.'));
    image.src = svgDataUrl(svg);
  });
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
