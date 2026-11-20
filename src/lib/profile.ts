/** Cleaning up profile links typed by writers (D-041). */

/** "octocat", "@octocat", "github.com/octocat" or a full URL -> https://github.com/octocat */
export function normalizeGithub(v: string): string | null | { error: string } {
  const t = v.trim().replace(/^@/, '');
  if (!t) return null;
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i.exec(t) ?? /^([A-Za-z0-9-]{1,39})$/.exec(t);
  return m ? `https://github.com/${m[1]}` : { error: 'GitHub: enter your username or your github.com/username link.' };
}
/** "in/asha", "linkedin.com/in/asha" or a full URL -> https://www.linkedin.com/in/asha */
export function normalizeLinkedin(v: string): string | null | { error: string } {
  const t = v.trim();
  if (!t) return null;
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]{3,100})\/?(?:\?.*)?$/i.exec(t) ?? /^(?:in\/)?([A-Za-z0-9\-_]{3,100})$/.exec(t);
  return m ? `https://www.linkedin.com/in/${m[1]}` : { error: 'LinkedIn: paste your profile link (linkedin.com/in/...).' };
}
