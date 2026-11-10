/** About how big a download is, for "about 2.9 MB to download". */
export function aboutSize(bytes: number): string {
  if (bytes >= 1e6) return `about ${(bytes / 1e6).toFixed(1)} MB`;
  return `about ${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
