/**
 * Optional technical details for an article: difficulty, stack, versions, where it was tested, repository,
 * and the date the steps were last checked. Shown in a box above the article body; all fields optional.
 * Stored as JSON in posts.tech_meta and as front matter fields in editorial Markdown.
 */
import { z } from 'zod';

export * from './tech-labels';

export const TechMetaSchema = z.object({
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  /** Languages and frameworks, comma separated. */
  stack: z.string().max(120).optional(),
  /** Software versions used, e.g. "Node 22, Astro 7.4". */
  versions: z.string().max(160).optional(),
  /** Tested environment, e.g. "Windows 11, Chrome 140". */
  testedOn: z.string().max(160).optional(),
  repoUrl: z.string().max(300).regex(/^https:\/\/\S+$/, 'must be an https link').optional(),
  /** YYYY-MM-DD */
  lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type TechMeta = z.infer<typeof TechMetaSchema>;

/** Drops empty strings so the stored JSON only holds what the writer filled in. */
export function cleanTech(input: Record<string, unknown> | null | undefined): TechMeta {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input ?? {})) if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  const parsed = TechMetaSchema.safeParse(out);
  return parsed.success ? parsed.data : {};
}

export function parseTech(json: string | null | undefined): TechMeta {
  if (!json) return {};
  try {
    return cleanTech(JSON.parse(json));
  } catch {
    return {};
  }
}

export const hasTech = (t: TechMeta) => Object.keys(t).length > 0;
