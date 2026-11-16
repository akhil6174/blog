/**
 * D1 (SQLite) schema. Two groups:
 *  1. Better Auth tables (user, session, account, verification) with our extra user columns.
 *  2. Blog tables from the plan: posts (community), post_stats, raises, post_revisions, tags, post_tags,
 *     comments, reports, moderation_log, settings.
 * Editorial posts stay as Markdown in src/content; only community content lives here.
 */
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const now = sql`(unixepoch())`;

// ---------- Better Auth ----------
export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
    // ours
    role: text('role', { enum: ['reader', 'writer', 'trusted', 'admin'] }).notNull().default('writer'),
    handle: text('handle'),
    bio: text('bio'),
    /** Portfolio or personal site shown on the writer page. */
    website: text('website'),
    trustScore: integer('trust_score').notNull().default(0),
    bannedAt: integer('banned_at', { mode: 'timestamp' }),
    shadowBanned: integer('shadow_banned', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('user_email_idx').on(t.email), uniqueIndex('user_handle_idx').on(t.handle)],
);

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('session_token_idx').on(t.token), index('session_user_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ---------- Blog ----------
export const POST_STATUS = ['draft', 'submitted', 'checking', 'pending_review', 'changes_requested', 'scheduled', 'published', 'rejected', 'hidden', 'unpublished', 'trashed'] as const;
export type PostStatus = (typeof POST_STATUS)[number];

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    description: text('description'),
    /** Optional <title> override for search results (defaults to the article title). */
    seoTitle: text('seo_title'),
    /** One of SITE.topics, stored as a slug (e.g. "web-development"). */
    category: text('category'),
    /** Who wrote the summary: 'ai' (generated) or 'user' (typed or edited). Protects user edits from regeneration. */
    summarySource: text('summary_source'),
    /** Sentence fingerprints of the text the AI summary was made from; detects big content changes. */
    summaryBasis: text('summary_basis'),
    /** Admin-only: pinned at the top of the community listing. */
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    bodyJson: text('body_json').notNull(), // Tiptap document (source of truth)
    bodyHtml: text('body_html').notNull().default(''), // rendered once on save, sanitised
    bodyText: text('body_text').notNull().default(''), // plain text for moderation and search
    coverImage: text('cover_image'),
    coverAlt: text('cover_alt'),
    /** Optional technical details as JSON (src/lib/tech.ts): difficulty, stack, versions, tested on, repo, last verified. */
    techMeta: text('tech_meta'),
    /** Bumped by every editor save. A save based on an older version is refused (two tabs or devices). */
    version: integer('version').notNull().default(0),
    status: text('status', { enum: POST_STATUS }).notNull().default('draft'),
    /** community: moderated, served from D1 at /p/<slug>. editorial: admin-written, committed as Markdown to the repo and served statically at /blog/<slug>. */
    kind: text('kind', { enum: ['community', 'editorial'] }).notNull().default('community'),
    /** Editorial only: when the scheduler should publish it. */
    scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
    qualityScore: integer('quality_score'),
    indexAllowed: integer('index_allowed', { mode: 'boolean' }).notNull().default(false),
    adsAllowed: integer('ads_allowed', { mode: 'boolean' }).notNull().default(false),
    wordCount: integer('word_count').notNull().default(0),
    readingMinutes: integer('reading_minutes').notNull().default(1),
    viewsCount: integer('views_count').notNull().default(0),
    raisesCount: integer('raises_count').notNull().default(0),
    commentsCount: integer('comments_count').notNull().default(0),
    reportsCount: integer('reports_count').notNull().default(0),
    rejectReason: text('reject_reason'),
    contentHash: text('content_hash'),
    submittedAt: integer('submitted_at', { mode: 'timestamp' }),
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('posts_slug_idx').on(t.slug),
    index('posts_author_idx').on(t.authorId),
    index('posts_status_published_idx').on(t.status, t.publishedAt),
    index('posts_hash_idx').on(t.contentHash),
  ],
);

export const postRevisions = sqliteTable(
  'post_revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    bodyJson: text('body_json').notNull(),
    title: text('title').notNull(),
    savedAt: integer('saved_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('post_revisions_post_idx').on(t.postId, t.savedAt)],
);

export const postStats = sqliteTable(
  'post_stats',
  {
    /** Community post id, or "editorial:<slug>" for Markdown posts (no FK on purpose). */
    postId: text('post_id').notNull(),
    day: text('day').notNull(), // YYYY-MM-DD (UTC)
    views: integer('views').notNull().default(0),
    raises: integer('raises').notNull().default(0),
    comments: integer('comments').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.day] }), index('post_stats_day_idx').on(t.day)],
);

export const raises = sqliteTable(
  'raises',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    /** Community post id, or "editorial:<slug>" (no FK on purpose). */
    postId: text('post_id').notNull(),
    count: integer('count').notNull().default(0), // 1..50
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);

export const tags = sqliteTable('tags', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  postsCount: integer('posts_count').notNull().default(0),
});

export const postTags = sqliteTable(
  'post_tags',
  {
    postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    tagSlug: text('tag_slug').notNull().references(() => tags.slug, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagSlug] }), index('post_tags_tag_idx').on(t.tagSlug)],
);

export const COMMENT_STATUS = ['checking', 'published', 'pending_review', 'rejected', 'hidden'] as const;

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    /** Community post id, or "editorial:<slug>" for Markdown posts (no FK on purpose). */
    postId: text('post_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    body: text('body').notNull(),
    bodyHtml: text('body_html').notNull().default(''),
    status: text('status', { enum: COMMENT_STATUS }).notNull().default('checking'),
    reportsCount: integer('reports_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('comments_post_idx').on(t.postId, t.status, t.createdAt)],
);

export const reports = sqliteTable(
  'reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: ['post', 'comment'] }).notNull(),
    targetId: text('target_id').notNull(),
    reporterId: text('reporter_id').references(() => user.id, { onDelete: 'set null' }),
    reporterIpHash: text('reporter_ip_hash'),
    reason: text('reason').notNull(),
    note: text('note'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('reports_target_idx').on(t.targetType, t.targetId), index('reports_open_idx').on(t.resolvedAt)],
);

export const moderationLog = sqliteTable(
  'moderation_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: ['post', 'comment'] }).notNull(),
    targetId: text('target_id').notNull(),
    step: text('step').notNull(), // rules | harmful | quality | decide | finalize | admin
    provider: text('provider'), // code | openai | workers-ai | admin
    model: text('model'),
    verdict: text('verdict').notNull(), // pass | publish | reject | unsure | error
    reason: text('reason'),
    score: integer('score'),
    rawResponse: text('raw_response'),
    fallback: integer('fallback', { mode: 'boolean' }).notNull().default(false),
    durationMs: integer('duration_ms'),
    actorId: text('actor_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('moderation_log_target_idx').on(t.targetType, t.targetId), index('moderation_log_created_idx').on(t.createdAt)],
);

/** Who did what in the admin area and on account-level actions. Kept small: one row per admin action. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetId: text('target_id'),
    detail: text('detail'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
});

export const schema = { user, session, account, verification, posts, postRevisions, postStats, raises, tags, postTags, comments, reports, moderationLog, auditLog, settings };
