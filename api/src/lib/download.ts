/** Force an immediate local download with a native "Save As" picker first (no new tabs, ever). */
export async function downloadImageFile(productImageUrl: string, filename: string): Promise<void> {
  try {
    const response = await fetch(productImageUrl);
    const blob = await response.blob();

    // 1) Native OS "Save As" picker (File System Access API)
    if ('showSaveFilePicker' in window) {
      try {
        const picker = (window as any).showSaveFilePicker as (opts: any) => Promise<any>;
        const handle = await picker({
          suggestedName: filename,
          types: [{ description: 'Image PNG', accept: { 'image/png': ['.png'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch {
        /* user cancelled or unsupported — fall through to the anchor bridge */
      }
    }

    // 2) Universal fallback: Base64 data-URL on a body-attached <a download> (never a new tab)
    const reader = new FileReader();
    reader.onloadend = function () {
      const downloadLink = document.createElement('a');
      downloadLink.href = reader.result as string;
      downloadLink.download = filename;
      downloadLink.style.display = 'none';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    // never open a new window/tab — fail silently in place
    console.error('download failed', e);
  }
}
