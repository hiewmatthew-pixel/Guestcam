import JSZip from 'jszip';

export type ZippableItem = {
  url: string;
  filename: string;
};

export async function downloadAsZip(items: ZippableItem[], zipName: string) {
  const zip = new JSZip();
  // fetch a few at a time: hundreds of parallel 30 MB clip downloads
  // run phones out of memory
  const BATCH = 4;
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(
      items.slice(i, i + BATCH).map(async (it) => {
        try {
          const res = await fetch(it.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          zip.file(it.filename, await res.blob());
        } catch (e) {
          // skip failed items, don't break the whole zip
          console.warn('failed to fetch for zip:', it.url, e);
        }
      }),
    );
  }
  const out = await zip.generateAsync({ type: 'blob', streamFiles: true });
  const link = document.createElement('a');
  const url = URL.createObjectURL(out);
  link.href = url;
  link.download = zipName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
