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
    /** Optional, shown on the writer page (Campus Writers Programme). */
    college: text('college'),
    /** Comma-separated interests, shown on the writer page. */
    interests: text('interests'),
    /** Public profile links (full https URLs), shown on the writer page. */
    github: text('github'),
    linkedin: text('linkedin'),
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
    /** Internship code the writer entered (intern_codes.code); counts toward that intern's articles. */
    internCode: text('intern_code'),
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
    index('posts_intern_code_idx').on(t.internCode),
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
    /** Set when the writer edited the comment (it is checked again). */
    editedAt: integer('edited_at', { mode: 'timestamp' }),
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

// ---------- Readers ----------
/** Saved articles. postId is a community post id or "editorial:<slug>" (no FK on purpose). */
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    postId: text('post_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);

/** In-site notifications shown on /me/notifications. */
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // article | comment | reply | reward | ranking | announcement
    title: text('title').notNull(),
    link: text('link'),
    readAt: integer('read_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)],
);

// ---------- Campus Writers Programme (src/lib/programme.ts) ----------
/** One row per competition month. */
export const competitions = sqliteTable('competitions', {
  month: text('month').primaryKey(), // YYYY-MM (India time)
  status: text('status', { enum: ['open', 'finalised', 'published'] }).notNull().default('open'),
  finalisedAt: integer('finalised_at', { mode: 'timestamp' }),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  note: text('note'),
});

/** An article's entry in a month: editor scores (0 to 10 each), genuine upvotes, final score, rank and prize. */
export const competitionEntries = sqliteTable(
  'competition_entries',
  {
    month: text('month').notNull(),
    postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    upvotes: integer('upvotes').notNull().default(0),
    /** Upvotes from accounts younger than two days when they voted, or that only ever voted for this writer. */
    suspiciousVotes: integer('suspicious_votes').notNull().default(0),
    accuracy: integer('accuracy'),
    quality: integer('quality'),
    originality: integer('originality'),
    clarity: integer('clarity'),
    /** Final score out of 100 (one decimal, stored x10). */
    score: integer('score'),
    rank: integer('rank'),
    prize: integer('prize').notNull().default(0),
    disqualified: integer('disqualified', { mode: 'boolean' }).notNull().default(false),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.month, t.postId] }), index('competition_entries_author_idx').on(t.authorId)],
);

/**
 * Reward ledger, in whole rupees. Every credit, adjustment and payment is a row. Payment details are NOT stored
 * here: the editor collects them by email and records the payment reference (owner decision, D-031).
 */
export const rewards = sqliteTable(
  'rewards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** No foreign key on purpose: financial records survive account deletion. */
    userId: text('user_id').notNull(),
    kind: text('kind', { enum: ['first_article', 'monthly_prize', 'adjustment'] }).notNull(),
    amount: integer('amount').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'paid', 'cancelled'] }).notNull().default('pending'),
    month: text('month'),
    postId: text('post_id'),
    paymentRef: text('payment_ref'),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('rewards_user_idx').on(t.userId), index('rewards_status_idx').on(t.status)],
);

/** Applications from /join-us (internships and contributor requests), separate from sign-up. */
export const applications = sqliteTable(
  'applications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    track: text('track', { enum: ['internship', 'contributor'] }).notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    college: text('college'),
    interests: text('interests'),
    sampleUrl: text('sample_url'),
    message: text('message').notNull(),
    status: text('status', { enum: ['new', 'shortlisted', 'accepted', 'declined'] }).notNull().default('new'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('applications_status_idx').on(t.status, t.createdAt)],
);

// ---------- Internships (src/lib/internship.ts, D-032) ----------
/**
 * One code per intern. Interns are recruited and given projects off-site (LinkedIn, email); they paste their code
 * in the editor when submitting each article. The editor watches the published count per code on /admin/internships
 * and emails the certificate when it reaches the target.
 */
export const internCodes = sqliteTable(
  'intern_codes',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    /** The Google email the intern signs in with. The code only works on that account. */
    email: text('email').notNull(),
    note: text('note'),
    certificateSentAt: integer('certificate_sent_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('intern_codes_email_idx').on(t.email)],
);

// ---------- Campus ambassadors (src/lib/ambassadors.ts, D-040) ----------
/**
 * Colleges the owner recruits ambassadors for. One ambassador per college and one college per ambassador
 * (both enforced by unique indexes). Ambassadors are found off-site (LinkedIn, email) and assigned here by the
 * Google email they signed in with.
 */
export const colleges = sqliteTable(
  'colleges',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    city: text('city'),
    state: text('state'),
    ambassadorId: text('ambassador_id').references(() => user.id, { onDelete: 'set null' }),
    ambassadorSince: integer('ambassador_since', { mode: 'timestamp' }),
    certificateSentAt: integer('certificate_sent_at', { mode: 'timestamp' }),
    /** One-time code the editor sends to the chosen student; entering it on /me makes them this college's ambassador. */
    ambassadorCode: text('ambassador_code'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [uniqueIndex('colleges_code_idx').on(t.ambassadorCode), uniqueIndex('colleges_name_idx').on(t.name), uniqueIndex('colleges_ambassador_idx').on(t.ambassadorId)],
);

/** DSA sheet progress (D-042): one row per user and problem they touched. Problem ids are slugs from src/lib/dsa-sheet.ts. */
export const dsaProgress = sqliteTable(
  'dsa_progress',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    problemId: text('problem_id').notNull(),
    /** When it was marked solved (null: not solved, only starred for revision). */
    solvedAt: integer('solved_at', { mode: 'timestamp_ms' }),
    revise: integer('revise', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.problemId] })],
);

/** Profiles on the public /people/ page (D-044): interns who completed the internship and campus ambassadors. Admin-managed. */
export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: ['intern', 'ambassador'] }).notNull(),
    name: text('name').notNull(),
    /** Uploaded /media/... path. */
    photo: text('photo'),
    role: text('role'),
    college: text('college'),
    /** Free text such as "Jun – Aug 2026". */
    period: text('period'),
    summary: text('summary'),
    github: text('github'),
    linkedin: text('linkedin'),
    website: text('website'),
    /** One highlight link (project, article or certificate). */
    highlightUrl: text('highlight_url'),
    highlightLabel: text('highlight_label'),
    published: integer('published', { mode: 'boolean' }).notNull().default(true),
    /** Lower comes first. */
    sort: integer('sort').notNull().default(100),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('people_kind_idx').on(t.kind, t.published, t.sort)],
);

/** Messages the admin sends to ambassadors and interns (D-046). Each recipient gets a notification linking to /me/notices/<id>/. */
export const notices = sqliteTable('notices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  sender: text('sender').notNull(),
  /** Who it was sent to, for the admin's history, e.g. "All campus ambassadors (12)". */
  audience: text('audience').notNull(),
  recipients: integer('recipients').notNull().default(0),
  /** Set for a suggestion or removal notice about one article (D-048). */
  postId: text('post_id'),
  kind: text('kind', { enum: ['message', 'suggestion', 'removal'] }).notNull().default('message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
});

/** Events on /events/ (D-047), managed on /admin/events. Times are stored as UTC and shown in India time. */
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    description: text('description').notNull(),
    coverImage: text('cover_image'),
    link: text('link'),
    linkLabel: text('link_label'),
    location: text('location'),
    startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
    endsAt: integer('ends_at', { mode: 'timestamp' }),
    published: integer('published', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  },
  (t) => [index('events_starts_idx').on(t.published, t.startsAt)],
);

/** Anonymous usage counts for student tools (D-049): one row per India-time day, tool and action. No personal data. */
export const toolUsage = sqliteTable(
  'tool_usage',
  {
    day: text('day').notNull(),
    tool: text('tool').notNull(),
    action: text('action').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.tool, t.action] })],
);

export const schema = { user, session, account, verification, posts, postRevisions, postStats, raises, tags, postTags, comments, reports, moderationLog, auditLog, settings, bookmarks, notifications, competitions, competitionEntries, rewards, applications, internCodes, colleges, dsaProgress, people, notices, events, toolUsage };
