/**
 * Hands a file to the browser as a download. The one place that does it: reports, exports, the backup and the student
 * file all end here.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A CSV answer of the server (a stream) as a file; the server wrote the cells, so formulas are already harmless. */
export async function saveCsvStream(
  stream: ReadableStream<Uint8Array> | null,
  filename: string,
): Promise<void> {
  const blob = await new Response(stream).blob();
  saveBlob(new Blob([blob], { type: 'text/csv;charset=utf-8' }), filename);
}

/** Text the page built itself (the backup JSON, a CSV the server sent as text) as a file. */
export function saveText(
  content: string,
  filename: string,
  type = 'text/csv;charset=utf-8',
): void {
  saveBlob(new Blob([content], { type }), filename);
}
