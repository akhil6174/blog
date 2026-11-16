/**
 * Article templates: a suggested structure of headings with one-line italic hints the writer replaces.
 * Writers can edit or delete every part. Kept short on purpose: structure, not filler text.
 */
import type { JSONContent } from '@tiptap/core';

const h2 = (text: string): JSONContent => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const h3 = (text: string): JSONContent => ({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] });
const hint = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'italic' }] }] });
const bullets = (...items: string[]): JSONContent => ({
  type: 'bulletList',
  content: items.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
});

export type Template = { id: string; name: string; description: string; content: JSONContent[] };

export const TEMPLATES: Template[] = [
  {
    id: 'tutorial',
    name: 'Technical tutorial',
    description: 'Teach the reader to build or set up something, step by step.',
    content: [
      hint('Open with what the reader will build, who it is for, and the end result in one or two sentences.'),
      h2('What you will need'),
      bullets('Tool or account, with version', 'Prior knowledge the reader should have'),
      h2('Step 1: Set up the project'),
      hint('Exact commands, then what the reader should see.'),
      h2('Step 2: Build the main part'),
      hint('Show the code, explain the one or two lines that matter.'),
      h2('Step 3: Test it'),
      hint('How to confirm it works, and the most common error with its fix.'),
      h2('Next steps'),
      hint('Where to go from here: one improvement, one related article.'),
    ],
  },
  {
    id: 'howto',
    name: 'How-to guide',
    description: 'Solve one specific problem quickly.',
    content: [
      hint('State the problem in one sentence and the fix in one more.'),
      h2('The short answer'),
      hint('The command, setting or snippet that solves it.'),
      h2('Why it happens'),
      hint('The cause, in plain words.'),
      h2('Step-by-step fix'),
      { type: 'orderedList', content: [1, 2, 3].map((n) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Step ${n}` }] }] })) },
      h2('If it still does not work'),
      hint('Two or three alternatives or checks.'),
    ],
  },
  {
    id: 'review',
    name: 'Software review',
    description: 'An honest, tested review of one tool or service.',
    content: [
      hint('What the tool is, who it is for, and your verdict in one line.'),
      h2('What I tested'),
      hint('Version, plan, how long you used it and for what.'),
      h2('What works well'),
      bullets('Strength with a concrete example'),
      h2('What does not'),
      bullets('Weakness with a concrete example'),
      h2('Pricing and free tier'),
      hint('Numbers from the official pricing page, with the date you checked.'),
      h2('Verdict'),
      hint('Who should use it, who should not, and the alternative you would pick.'),
    ],
  },
  {
    id: 'comparison',
    name: 'Product comparison',
    description: 'Compare two or more tools side by side.',
    content: [
      hint('Which tools, for which job, and the short answer.'),
      h2('At a glance'),
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: ['Feature', 'Tool A', 'Tool B'].map((t) => ({ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) },
          { type: 'tableRow', content: ['Free tier', '', ''].map((t) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] }] })) },
          { type: 'tableRow', content: ['Best for', '', ''].map((t) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] }] })) },
        ],
      },
      h2('How I compared them'),
      hint('Same task, same machine, what you measured.'),
      h2('Tool A'),
      h2('Tool B'),
      h2('Which one to choose'),
      hint('Recommendation by situation.'),
    ],
  },
  {
    id: 'opinion',
    name: 'Opinion article',
    description: 'Argue a clear position from experience.',
    content: [
      hint('Your claim in one sentence, and why it matters now.'),
      h2('The common view'),
      h2('Why I disagree'),
      hint('Your experience and evidence.'),
      h2('The strongest counter-argument'),
      hint('State it fairly, then answer it.'),
      h2('What to do instead'),
    ],
  },
  {
    id: 'showcase',
    name: 'Project showcase',
    description: 'Show something you built and what you learned.',
    content: [
      hint('What you built, a link or screenshot, and why you built it.'),
      h2('The problem'),
      h2('How it works'),
      h3('Architecture'),
      h3('Interesting parts of the code'),
      h2('What I learned'),
      bullets('Lesson one', 'Lesson two'),
      h2('Try it yourself'),
      hint('Repository link and how to run it.'),
    ],
  },
  {
    id: 'news',
    name: 'News and updates',
    description: 'Explain a release or announcement and what it means.',
    content: [
      hint('What changed, who announced it, and when.'),
      h2('What is new'),
      bullets('Change one', 'Change two'),
      h2('What it means for developers'),
      h2('How to try it'),
      hint('Link to the official source.'),
    ],
  },
];
