import JSZip from 'jszip';

export type ZippableItem = {
  url: string;
  filename: string;
};

export async function downloadAsZip(items: ZippableItem[], zipName: string) {
  const zip = new JSZip();
  await Promise.all(
    items.map(async (it) => {
      try {
        const res = await fetch(it.url);
        const blob = await res.blob();
        zip.file(it.filename, blob);
      } catch (e) {
        // skip failed items, don't break the whole zip
        console.warn('failed to fetch for zip:', it.url, e);
      }
    }),
  );
  const out = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(out);
  link.href = url;
  link.download = zipName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
