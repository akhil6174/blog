/**
 * Content quality check for editorial posts (Phase 2 tooling).
 * Reports word count, missing description/cover/alt, heading order, internal-link count, and tags used by too few posts.
 * Exit code 1 if any PUBLISHED post has a blocking problem, so CI can fail the build.
 *
 *   npm run check:content
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'src/content/posts');
const files = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));

function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = {};
  if (!m) return { fm, body: src };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^"|"$/g, '');
  }
  return { fm, body: src.slice(m[0].length) };
}

const posts = files.map((f) => {
  const { fm, body } = frontmatter(readFileSync(join(dir, f), 'utf8'));
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const headings = [...body.matchAll(/^(#{1,6})\s/gm)].map((h) => h[1].length);
  const internalLinks = [...body.matchAll(/\]\((\/[^)\s]*)\)/g)].length;
  const imagesNoAlt = [...body.matchAll(/!\[\s*\]\(/g)].length;
  const tags = (fm.tags ?? '').replace(/[\[\]"]/g, '').split(',').map((t) => t.trim()).filter(Boolean);
  const draft = fm.draft === 'true';
  const problems = [];
  const warnings = [];
  if (!fm.description) problems.push('missing description');
  if (fm.cover && !fm.coverAlt) problems.push('cover without coverAlt');
  if (imagesNoAlt) problems.push(`${imagesNoAlt} image(s) without alt text`);
  if (headings.some((h) => h === 1)) warnings.push('uses an H1 inside the body (the title is already the H1)');
  for (let i = 1; i < headings.length; i++) if (headings[i] > headings[i - 1] + 1) warnings.push('heading levels skip (e.g. H2 → H4)');
  if (words < 600) warnings.push(`short: ${words} words (aim for 800+ on most topics)`);
  if (internalLinks < 2) warnings.push(`only ${internalLinks} internal link(s); aim for 2+`);
  return { file: f, draft, words, tags, problems, warnings: [...new Set(warnings)] };
});

const tagCount = new Map();
for (const p of posts.filter((p) => !p.draft)) for (const t of p.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);

let failed = false;
for (const p of posts) {
  const flag = p.draft ? '(draft)' : '';
  console.log(`\n${p.file} ${flag}  ${p.words} words  tags: ${p.tags.join(', ') || 'none'}`);
  for (const x of p.problems) console.log(`  ✖ ${x}`);
  for (const x of p.warnings) console.log(`  ⚠ ${x}`);
  if (!p.draft && p.problems.length) failed = true;
}
const thin = [...tagCount].filter(([, n]) => n < 3);
if (thin.length) console.log(`\n⚠ tags with fewer than 3 published posts (tag pages stay noindex): ${thin.map(([t, n]) => `${t} (${n})`).join(', ')}`);
console.log(`\n${posts.filter((p) => !p.draft).length} published, ${posts.filter((p) => p.draft).length} drafts.`);
process.exit(failed ? 1 : 0);
