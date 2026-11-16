/**
 * GET /api/admin/export?type=articles|writers|reports|audit|rewards|internships : download site data as JSON (admin only, via middleware).
 * For keeping your own copy or moving elsewhere. Article bodies are included as Tiptap JSON and plain text.
 * Full database backups are separate: `npm run db:backup` (docs/SETUP-GUIDE.md).
 */
import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { auditLog, db, posts, reports, rewards, user } from '../../../lib/db';
import { codeOverview } from '../../../lib/internship';
import { audit } from '../../../lib/audit';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const type = url.searchParams.get('type') ?? 'articles';
  const d = db();
  let data: unknown;
  if (type === 'articles') {
    data = await d.select({ id: posts.id, kind: posts.kind, status: posts.status, slug: posts.slug, title: posts.title, subtitle: posts.subtitle, description: posts.description, category: posts.category, authorId: posts.authorId, wordCount: posts.wordCount, views: posts.viewsCount, raises: posts.raisesCount, comments: posts.commentsCount, techMeta: posts.techMeta, createdAt: posts.createdAt, publishedAt: posts.publishedAt, updatedAt: posts.updatedAt, bodyJson: posts.bodyJson, bodyText: posts.bodyText }).from(posts).orderBy(desc(posts.updatedAt));
  } else if (type === 'writers') {
    data = await d.select({ id: user.id, name: user.name, email: user.email, role: user.role, handle: user.handle, bio: user.bio, website: user.website, trustScore: user.trustScore, bannedAt: user.bannedAt, createdAt: user.createdAt }).from(user).orderBy(desc(user.createdAt));
  } else if (type === 'reports') {
    data = await d.select().from(reports).orderBy(desc(reports.id));
  } else if (type === 'audit') {
    data = await d.select().from(auditLog).orderBy(desc(auditLog.id)).limit(5000);
  } else if (type === 'rewards') {
    data = await d.select({ r: rewards, name: user.name, email: user.email }).from(rewards).leftJoin(user, eq(user.id, rewards.userId)).orderBy(desc(rewards.id));
  } else if (type === 'internships') {
    data = await codeOverview();
  } else {
    return Response.json({ error: 'type must be articles, writers, reports, audit, rewards or internships' }, { status: 400 });
  }
  await audit(locals.user!.id, 'export', type, null);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), type, data }, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="trutiai-${type}-${day}.json"`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
};
