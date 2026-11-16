/**
 * Minimal GitHub Contents API client for editorial publishing (D-029).
 * Needs the secret GITHUB_TOKEN: a fine-grained token with "Contents: read and write" on this repository only.
 * With GITHUB_DRY_RUN=true (local testing) nothing is sent: files are kept in KV under `dryrun:<path>` instead.
 */
import { env } from 'cloudflare:workers';

type Env2 = { GITHUB_TOKEN?: string; GITHUB_DRY_RUN?: string };
const sec = env as unknown as Env2;

export function githubConfigured(): boolean {
  return !!sec.GITHUB_TOKEN || isDryRun();
}

export function isDryRun(): boolean {
  return sec.GITHUB_DRY_RUN === 'true';
}

function repo(): string {
  return env.GITHUB_REPO || 'akhil6174/blog';
}
function branch(): string {
  return env.GITHUB_BRANCH || 'main';
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${repo()}/contents/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${sec.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'trutiai-editorial-publisher',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
}

async function currentSha(path: string): Promise<string | null> {
  const r = await gh(`${path}?ref=${encodeURIComponent(branch())}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub read failed (${r.status}).`);
  return ((await r.json()) as { sha?: string }).sha ?? null;
}

export type CommitResult = { ok: true; commitUrl: string | null; dryRun: boolean } | { ok: false; error: string };

/**
 * Create or update a file. `mustOwn`: refuse to overwrite a file this editor did not write (protects hand-written
 * Markdown posts that happen to share the slug).
 */
export async function putFile(path: string, content: string, message: string, opts: { mustOwnMarker?: string } = {}): Promise<CommitResult> {
  if (isDryRun()) {
    const prev = await env.CACHE.get(`dryrun:${path}`);
    if (prev === null && opts.mustOwnMarker && (await env.CACHE.get(`dryrun-foreign:${path}`)) !== null) return { ok: false, error: 'An article with this address already exists in the repository.' };
    await env.CACHE.put(`dryrun:${path}`, content, { expirationTtl: 7 * 86400 });
    return { ok: true, commitUrl: null, dryRun: true };
  }
  if (!sec.GITHUB_TOKEN) return { ok: false, error: 'Publishing is not connected yet: add the GITHUB_TOKEN secret (setup guide, section 15).' };
  try {
    let sha = await currentSha(path);
    if (sha && opts.mustOwnMarker) {
      const r = await gh(`${path}?ref=${encodeURIComponent(branch())}`, { headers: { accept: 'application/vnd.github.raw+json' } });
      const existing = r.ok ? await r.text() : '';
      if (!existing.includes(opts.mustOwnMarker)) return { ok: false, error: 'An article written outside the editor already uses this address. Change the URL and publish again.' };
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await gh(path, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, content: b64(content), branch: branch(), ...(sha ? { sha } : {}) }) });
      if (r.ok) {
        const j = (await r.json()) as { commit?: { html_url?: string } };
        return { ok: true, commitUrl: j.commit?.html_url ?? null, dryRun: false };
      }
      if (r.status === 409 && attempt === 0) {
        sha = await currentSha(path); // someone pushed in between: retry once with the new sha
        continue;
      }
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'GitHub refused the token. Check that GITHUB_TOKEN has Contents read and write on this repository.' };
      return { ok: false, error: `GitHub answered ${r.status}: ${(await r.text()).slice(0, 160)}` };
    }
    return { ok: false, error: 'GitHub kept reporting a conflict. Try again in a minute.' };
  } catch (e) {
    return { ok: false, error: `GitHub could not be reached: ${(e as Error).message}` };
  }
}

export async function deleteFile(path: string, message: string): Promise<CommitResult> {
  if (isDryRun()) {
    await env.CACHE.delete(`dryrun:${path}`);
    return { ok: true, commitUrl: null, dryRun: true };
  }
  if (!sec.GITHUB_TOKEN) return { ok: false, error: 'Publishing is not connected yet: add the GITHUB_TOKEN secret.' };
  try {
    const sha = await currentSha(path);
    if (!sha) return { ok: true, commitUrl: null, dryRun: false };
    const r = await gh(path, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, sha, branch: branch() }) });
    if (!r.ok) return { ok: false, error: `GitHub answered ${r.status} when removing the file.` };
    const j = (await r.json()) as { commit?: { html_url?: string } };
    return { ok: true, commitUrl: j.commit?.html_url ?? null, dryRun: false };
  } catch (e) {
    return { ok: false, error: `GitHub could not be reached: ${(e as Error).message}` };
  }
}
