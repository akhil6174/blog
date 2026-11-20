/**
 * Resume builder data model (D-039). Plain data, no PDF code, so the form can load it without pulling in the
 * PDF library (that lives in resume-pdf.ts and is loaded only when a preview or download is made).
 */

export type ResumeLink = { label: string; url: string };
export type Education = { school: string; degree: string; location: string; start: string; end: string; score: string };
export type Experience = { role: string; org: string; location: string; start: string; end: string; points: string };
export type Project = { name: string; tech: string; link: string; start: string; end: string; points: string };
export type SkillGroup = { label: string; items: string };

export type ResumeData = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: ResumeLink[];
  summary: string;
  education: Education[];
  skills: SkillGroup[];
  projects: Project[];
  experience: Experience[];
  achievements: string;
  certifications: string;
};

export type TemplateId = 'classic' | 'modern' | 'compact';

export const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
  { id: 'classic', name: 'Classic', description: 'Serif type, centred name, thin lines between sections. The traditional look most tech students use.' },
  { id: 'modern', name: 'Modern', description: 'Clean sans-serif with purple section headings. Easy to scan.' },
  { id: 'compact', name: 'Compact', description: 'Tighter spacing and smaller type to fit everything on one page.' },
];

/** Example content shown the first time, clearly an example (the name says so). */
export const SAMPLE_RESUME: ResumeData = {
  name: 'Your Name',
  headline: 'Computer Science student · Backend and AI',
  email: 'yourname@email.com',
  phone: '+91 98765 43210',
  location: 'Pune, India',
  links: [
    { label: 'GitHub', url: 'https://github.com/yourname' },
    { label: 'LinkedIn', url: 'https://linkedin.com/in/yourname' },
  ],
  summary: '',
  education: [
    { school: 'Your College of Engineering', degree: 'B.Tech in Computer Science and Engineering', location: 'Pune', start: '2023', end: '2027', score: 'CGPA 8.4 / 10' },
    { school: 'Your School', degree: 'Class XII (CBSE)', location: 'Pune', start: '2021', end: '2023', score: '91%' },
  ],
  skills: [
    { label: 'Languages', items: 'Python, Java, JavaScript, SQL' },
    { label: 'Frameworks', items: 'FastAPI, React, Node.js' },
    { label: 'Tools', items: 'Git, Docker, Linux, PostgreSQL' },
  ],
  projects: [
    {
      name: 'Attendance planner (PWA)',
      tech: 'TypeScript, IndexedDB, Service Worker',
      link: 'https://github.com/yourname/attendance-planner',
      start: 'Jan 2026',
      end: 'Feb 2026',
      points: 'Built an offline-first app that tells students how many classes they can miss at 75%\nUsed by 300+ students in my college; works without internet after the first visit\nWrote unit tests for every calculation, including edge cases',
    },
    {
      name: 'Notes chatbot with RAG',
      tech: 'Python, FastAPI, Ollama, ChromaDB',
      link: '',
      start: 'Oct 2025',
      end: 'Dec 2025',
      points: 'Answers questions from semester PDFs and shows the page each answer came from\nCompared three chunk sizes on 20 test questions; the best setting answered 17 correctly',
    },
  ],
  experience: [
    {
      role: 'Technical Content Developer Intern',
      org: 'TrutiAI',
      location: 'Remote',
      start: 'Jun 2026',
      end: 'Jul 2026',
      points: 'Built three projects and published a technical article about each on trutiai.in\nRevised code and writing based on editorial feedback',
    },
  ],
  achievements: 'Finalist, college hackathon 2025 (team of 4, 120 teams)\nSolved 300+ problems on LeetCode and Codeforces',
  certifications: '',
};

export const EMPTY_RESUME: ResumeData = {
  name: '', headline: '', email: '', phone: '', location: '', links: [{ label: 'GitHub', url: '' }, { label: 'LinkedIn', url: '' }], summary: '',
  education: [{ school: '', degree: '', location: '', start: '', end: '', score: '' }],
  skills: [{ label: 'Languages', items: '' }, { label: 'Frameworks', items: '' }, { label: 'Tools', items: '' }],
  projects: [{ name: '', tech: '', link: '', start: '', end: '', points: '' }],
  experience: [],
  achievements: '',
  certifications: '',
};

/** Non-empty lines of a multi-line field, without leading bullet characters people often type. */
export function lines(s: string): string[] {
  return s.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•·]\s*/, '').trim()).filter(Boolean);
}

/** "Jan 2026 – Mar 2026", "2023 – Present", or whichever part is filled in. */
export function dateRange(start: string, end: string): string {
  const a = start.trim();
  const b = end.trim();
  return a && b ? `${a} – ${b}` : a || b;
}

/** Display form of a URL: without the protocol, "www." and a trailing slash. */
export function prettyUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

/** Restore a saved resume, filling in any fields added since it was saved. */
export function normalizeResume(raw: unknown): ResumeData {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ResumeData>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const arr = <T,>(v: unknown, map: (x: Record<string, unknown>) => T): T[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => map(x as Record<string, unknown>)) : []);
  return {
    name: str(r.name), headline: str(r.headline), email: str(r.email), phone: str(r.phone), location: str(r.location), summary: str(r.summary),
    links: arr(r.links, (x) => ({ label: str(x.label), url: str(x.url) })),
    education: arr(r.education, (x) => ({ school: str(x.school), degree: str(x.degree), location: str(x.location), start: str(x.start), end: str(x.end), score: str(x.score) })),
    skills: arr(r.skills, (x) => ({ label: str(x.label), items: str(x.items) })),
    projects: arr(r.projects, (x) => ({ name: str(x.name), tech: str(x.tech), link: str(x.link), start: str(x.start), end: str(x.end), points: str(x.points) })),
    experience: arr(r.experience, (x) => ({ role: str(x.role), org: str(x.org), location: str(x.location), start: str(x.start), end: str(x.end), points: str(x.points) })),
    achievements: str(r.achievements), certifications: str(r.certifications),
  };
}

/** A safe file name such as "Asha_Verma_Resume.pdf". */
export function resumeFileName(name: string): string {
  const base = name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${base || 'Resume'}${base ? '_Resume' : ''}.pdf`;
}
