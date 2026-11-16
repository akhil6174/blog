/**
 * URL slugs. Pure, so the editor (browser) and the posts API (server) produce identical addresses.
 */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 72) || 'post'
  );
}

/** Light clean-up while the writer types in the slug field (keeps a trailing hyphen so typing feels natural). */
export function slugTyping(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-/, '').slice(0, 72);
}
