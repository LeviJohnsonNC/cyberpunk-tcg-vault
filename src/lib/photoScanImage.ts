const IMAGE_BUDGET = 4_000_000; // Base64 data URLs, with room for JSON under Vercel's 4.5 MB limit.

export async function preparePhotoScan(file: File): Promise<{ image: string; detailImages?: string[] }> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the photo');

    const encode = (x: number, y: number, w: number, h: number, maxEdge: number, quality: number) => {
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      context.drawImage(bitmap, x, y, w, h, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    };

    const image = encode(0, 0, width, height, 1600, 0.85);
    if (Math.max(width, height) <= 1600) return { image };

    // Overlap the quadrants to keep card titles and footers near the seams in view.
    const w = Math.ceil(width * 0.6);
    const h = Math.ceil(height * 0.6);
    const corners = [[0, 0], [width - w, 0], [0, height - h], [width - w, height - h]];
    const details = (maxEdge: number, quality: number) => corners.map(([x, y]) => encode(x, y, w, h, maxEdge, quality));
    const fits = (images: string[]) => image.length + images.reduce((total, detail) => total + detail.length, 0) <= IMAGE_BUDGET;

    let detailImages = details(1800, 0.9);
    if (!fits(detailImages)) detailImages = details(1400, 0.8);
    return fits(detailImages) ? { image, detailImages } : { image };
  } finally {
    bitmap.close();
  }
}
