export function clampThumbnailIndex(images: string[], thumbnailIndex: number | null | undefined) {
  if (images.length === 0) return 0;
  if (typeof thumbnailIndex !== "number" || Number.isNaN(thumbnailIndex)) return 0;
  return Math.min(Math.max(thumbnailIndex, 0), images.length - 1);
}

export function moveThumbnailToFront(images: string[], thumbnailIndex: number | null | undefined) {
  if (!images.length) return [];
  const index = clampThumbnailIndex(images, thumbnailIndex);
  if (index === 0) return [...images];
  const next = [...images];
  const [selected] = next.splice(index, 1);
  next.unshift(selected);
  return next;
}
