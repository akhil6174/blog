/**
 * The TrutiAI DSA sheet (D-042): problems grouped by topic, easy to hard within each topic, linking to LeetCode.
 * Only titles and links are listed (problem statements belong to LeetCode). Pure data and helpers: safe for
 * pre-rendered pages, islands and unit tests. Company tags come from student reports (dsa_company_reports), not
 * from this file, because there is no public, reliable company list to copy.
 */
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type Problem = { id: string; title: string; topic: string; difficulty: Difficulty; url: string };

type Row = [slug: string, title: string, d: 'E' | 'M' | 'H'];
const D = { E: 'Easy', M: 'Medium', H: 'Hard' } as const;

const RAW: [topic: string, rows: Row[]][] = [
  ['Arrays', [
    ['two-sum', 'Two Sum', 'E'],
    ['best-time-to-buy-and-sell-stock', 'Best Time to Buy and Sell Stock', 'E'],
    ['contains-duplicate', 'Contains Duplicate', 'E'],
    ['move-zeroes', 'Move Zeroes', 'E'],
    ['majority-element', 'Majority Element', 'E'],
    ['maximum-subarray', 'Maximum Subarray', 'M'],
    ['product-of-array-except-self', 'Product of Array Except Self', 'M'],
    ['sort-colors', 'Sort Colors', 'M'],
    ['next-permutation', 'Next Permutation', 'M'],
    ['rotate-image', 'Rotate Image', 'M'],
    ['spiral-matrix', 'Spiral Matrix', 'M'],
    ['set-matrix-zeroes', 'Set Matrix Zeroes', 'M'],
    ['subarray-sum-equals-k', 'Subarray Sum Equals K', 'M'],
    ['first-missing-positive', 'First Missing Positive', 'H'],
  ]],
  ['Strings', [
    ['valid-anagram', 'Valid Anagram', 'E'],
    ['valid-palindrome', 'Valid Palindrome', 'E'],
    ['longest-common-prefix', 'Longest Common Prefix', 'E'],
    ['reverse-words-in-a-string', 'Reverse Words in a String', 'M'],
    ['group-anagrams', 'Group Anagrams', 'M'],
    ['longest-palindromic-substring', 'Longest Palindromic Substring', 'M'],
    ['string-to-integer-atoi', 'String to Integer (atoi)', 'M'],
    ['string-compression', 'String Compression', 'M'],
    ['minimum-window-substring', 'Minimum Window Substring', 'H'],
  ]],
  ['Hashing', [
    ['happy-number', 'Happy Number', 'E'],
    ['isomorphic-strings', 'Isomorphic Strings', 'E'],
    ['top-k-frequent-elements', 'Top K Frequent Elements', 'M'],
    ['longest-consecutive-sequence', 'Longest Consecutive Sequence', 'M'],
    ['valid-sudoku', 'Valid Sudoku', 'M'],
    ['lru-cache', 'LRU Cache', 'M'],
  ]],
  ['Two pointers', [
    ['merge-sorted-array', 'Merge Sorted Array', 'E'],
    ['remove-duplicates-from-sorted-array', 'Remove Duplicates from Sorted Array', 'E'],
    ['two-sum-ii-input-array-is-sorted', 'Two Sum II - Input Array Is Sorted', 'M'],
    ['3sum', '3Sum', 'M'],
    ['container-with-most-water', 'Container With Most Water', 'M'],
    ['trapping-rain-water', 'Trapping Rain Water', 'H'],
  ]],
  ['Sliding window', [
    ['maximum-average-subarray-i', 'Maximum Average Subarray I', 'E'],
    ['longest-substring-without-repeating-characters', 'Longest Substring Without Repeating Characters', 'M'],
    ['longest-repeating-character-replacement', 'Longest Repeating Character Replacement', 'M'],
    ['permutation-in-string', 'Permutation in String', 'M'],
    ['max-consecutive-ones-iii', 'Max Consecutive Ones III', 'M'],
    ['sliding-window-maximum', 'Sliding Window Maximum', 'H'],
  ]],
  ['Binary search', [
    ['binary-search', 'Binary Search', 'E'],
    ['search-insert-position', 'Search Insert Position', 'E'],
    ['sqrtx', 'Sqrt(x)', 'E'],
    ['find-first-and-last-position-of-element-in-sorted-array', 'Find First and Last Position of Element in Sorted Array', 'M'],
    ['search-in-rotated-sorted-array', 'Search in Rotated Sorted Array', 'M'],
    ['find-minimum-in-rotated-sorted-array', 'Find Minimum in Rotated Sorted Array', 'M'],
    ['find-peak-element', 'Find Peak Element', 'M'],
    ['search-a-2d-matrix', 'Search a 2D Matrix', 'M'],
    ['koko-eating-bananas', 'Koko Eating Bananas', 'M'],
    ['capacity-to-ship-packages-within-d-days', 'Capacity To Ship Packages Within D Days', 'M'],
    ['median-of-two-sorted-arrays', 'Median of Two Sorted Arrays', 'H'],
  ]],
  ['Stack and queue', [
    ['valid-parentheses', 'Valid Parentheses', 'E'],
    ['implement-queue-using-stacks', 'Implement Queue using Stacks', 'E'],
    ['min-stack', 'Min Stack', 'M'],
    ['evaluate-reverse-polish-notation', 'Evaluate Reverse Polish Notation', 'M'],
    ['daily-temperatures', 'Daily Temperatures', 'M'],
    ['next-greater-element-ii', 'Next Greater Element II', 'M'],
    ['asteroid-collision', 'Asteroid Collision', 'M'],
    ['decode-string', 'Decode String', 'M'],
    ['largest-rectangle-in-histogram', 'Largest Rectangle in Histogram', 'H'],
  ]],
  ['Linked list', [
    ['reverse-linked-list', 'Reverse Linked List', 'E'],
    ['merge-two-sorted-lists', 'Merge Two Sorted Lists', 'E'],
    ['linked-list-cycle', 'Linked List Cycle', 'E'],
    ['middle-of-the-linked-list', 'Middle of the Linked List', 'E'],
    ['palindrome-linked-list', 'Palindrome Linked List', 'E'],
    ['intersection-of-two-linked-lists', 'Intersection of Two Linked Lists', 'E'],
    ['remove-nth-node-from-end-of-list', 'Remove Nth Node From End of List', 'M'],
    ['add-two-numbers', 'Add Two Numbers', 'M'],
    ['linked-list-cycle-ii', 'Linked List Cycle II', 'M'],
    ['reorder-list', 'Reorder List', 'M'],
    ['copy-list-with-random-pointer', 'Copy List with Random Pointer', 'M'],
    ['merge-k-sorted-lists', 'Merge k Sorted Lists', 'H'],
    ['reverse-nodes-in-k-group', 'Reverse Nodes in k-Group', 'H'],
  ]],
  ['Recursion and backtracking', [
    ['subsets', 'Subsets', 'M'],
    ['subsets-ii', 'Subsets II', 'M'],
    ['permutations', 'Permutations', 'M'],
    ['combination-sum', 'Combination Sum', 'M'],
    ['combination-sum-ii', 'Combination Sum II', 'M'],
    ['letter-combinations-of-a-phone-number', 'Letter Combinations of a Phone Number', 'M'],
    ['generate-parentheses', 'Generate Parentheses', 'M'],
    ['palindrome-partitioning', 'Palindrome Partitioning', 'M'],
    ['word-search', 'Word Search', 'M'],
    ['n-queens', 'N-Queens', 'H'],
    ['sudoku-solver', 'Sudoku Solver', 'H'],
  ]],
  ['Binary trees', [
    ['binary-tree-inorder-traversal', 'Binary Tree Inorder Traversal', 'E'],
    ['maximum-depth-of-binary-tree', 'Maximum Depth of Binary Tree', 'E'],
    ['invert-binary-tree', 'Invert Binary Tree', 'E'],
    ['same-tree', 'Same Tree', 'E'],
    ['symmetric-tree', 'Symmetric Tree', 'E'],
    ['diameter-of-binary-tree', 'Diameter of Binary Tree', 'E'],
    ['balanced-binary-tree', 'Balanced Binary Tree', 'E'],
    ['binary-tree-level-order-traversal', 'Binary Tree Level Order Traversal', 'M'],
    ['binary-tree-zigzag-level-order-traversal', 'Binary Tree Zigzag Level Order Traversal', 'M'],
    ['binary-tree-right-side-view', 'Binary Tree Right Side View', 'M'],
    ['lowest-common-ancestor-of-a-binary-tree', 'Lowest Common Ancestor of a Binary Tree', 'M'],
    ['construct-binary-tree-from-preorder-and-inorder-traversal', 'Construct Binary Tree from Preorder and Inorder Traversal', 'M'],
    ['path-sum-ii', 'Path Sum II', 'M'],
    ['binary-tree-maximum-path-sum', 'Binary Tree Maximum Path Sum', 'H'],
    ['serialize-and-deserialize-binary-tree', 'Serialize and Deserialize Binary Tree', 'H'],
  ]],
  ['Binary search trees', [
    ['search-in-a-binary-search-tree', 'Search in a Binary Search Tree', 'E'],
    ['convert-sorted-array-to-binary-search-tree', 'Convert Sorted Array to Binary Search Tree', 'E'],
    ['validate-binary-search-tree', 'Validate Binary Search Tree', 'M'],
    ['kth-smallest-element-in-a-bst', 'Kth Smallest Element in a BST', 'M'],
    ['lowest-common-ancestor-of-a-binary-search-tree', 'Lowest Common Ancestor of a Binary Search Tree', 'M'],
    ['insert-into-a-binary-search-tree', 'Insert into a Binary Search Tree', 'M'],
    ['delete-node-in-a-bst', 'Delete Node in a BST', 'M'],
    ['binary-search-tree-iterator', 'Binary Search Tree Iterator', 'M'],
  ]],
  ['Heaps', [
    ['kth-largest-element-in-a-stream', 'Kth Largest Element in a Stream', 'E'],
    ['last-stone-weight', 'Last Stone Weight', 'E'],
    ['kth-largest-element-in-an-array', 'Kth Largest Element in an Array', 'M'],
    ['k-closest-points-to-origin', 'K Closest Points to Origin', 'M'],
    ['task-scheduler', 'Task Scheduler', 'M'],
    ['find-median-from-data-stream', 'Find Median from Data Stream', 'H'],
  ]],
  ['Greedy', [
    ['assign-cookies', 'Assign Cookies', 'E'],
    ['lemonade-change', 'Lemonade Change', 'E'],
    ['jump-game', 'Jump Game', 'M'],
    ['jump-game-ii', 'Jump Game II', 'M'],
    ['gas-station', 'Gas Station', 'M'],
    ['partition-labels', 'Partition Labels', 'M'],
    ['candy', 'Candy', 'H'],
  ]],
  ['Intervals', [
    ['merge-intervals', 'Merge Intervals', 'M'],
    ['insert-interval', 'Insert Interval', 'M'],
    ['non-overlapping-intervals', 'Non-overlapping Intervals', 'M'],
    ['minimum-number-of-arrows-to-burst-balloons', 'Minimum Number of Arrows to Burst Balloons', 'M'],
  ]],
  ['Graphs', [
    ['flood-fill', 'Flood Fill', 'E'],
    ['find-if-path-exists-in-graph', 'Find if Path Exists in Graph', 'E'],
    ['number-of-islands', 'Number of Islands', 'M'],
    ['clone-graph', 'Clone Graph', 'M'],
    ['rotting-oranges', 'Rotting Oranges', 'M'],
    ['surrounded-regions', 'Surrounded Regions', 'M'],
    ['pacific-atlantic-water-flow', 'Pacific Atlantic Water Flow', 'M'],
    ['course-schedule', 'Course Schedule', 'M'],
    ['course-schedule-ii', 'Course Schedule II', 'M'],
    ['is-graph-bipartite', 'Is Graph Bipartite?', 'M'],
    ['number-of-provinces', 'Number of Provinces', 'M'],
    ['redundant-connection', 'Redundant Connection', 'M'],
    ['network-delay-time', 'Network Delay Time', 'M'],
    ['cheapest-flights-within-k-stops', 'Cheapest Flights Within K Stops', 'M'],
    ['min-cost-to-connect-all-points', 'Min Cost to Connect All Points', 'M'],
    ['word-ladder', 'Word Ladder', 'H'],
    ['swim-in-rising-water', 'Swim in Rising Water', 'H'],
  ]],
  ['Dynamic programming', [
    ['climbing-stairs', 'Climbing Stairs', 'E'],
    ['fibonacci-number', 'Fibonacci Number', 'E'],
    ['min-cost-climbing-stairs', 'Min Cost Climbing Stairs', 'E'],
    ['house-robber', 'House Robber', 'M'],
    ['house-robber-ii', 'House Robber II', 'M'],
    ['coin-change', 'Coin Change', 'M'],
    ['coin-change-ii', 'Coin Change II', 'M'],
    ['longest-increasing-subsequence', 'Longest Increasing Subsequence', 'M'],
    ['longest-common-subsequence', 'Longest Common Subsequence', 'M'],
    ['unique-paths', 'Unique Paths', 'M'],
    ['minimum-path-sum', 'Minimum Path Sum', 'M'],
    ['word-break', 'Word Break', 'M'],
    ['partition-equal-subset-sum', 'Partition Equal Subset Sum', 'M'],
    ['decode-ways', 'Decode Ways', 'M'],
    ['maximum-product-subarray', 'Maximum Product Subarray', 'M'],
    ['target-sum', 'Target Sum', 'M'],
    ['best-time-to-buy-and-sell-stock-with-cooldown', 'Best Time to Buy and Sell Stock with Cooldown', 'M'],
    ['edit-distance', 'Edit Distance', 'M'],
    ['longest-palindromic-subsequence', 'Longest Palindromic Subsequence', 'M'],
    ['burst-balloons', 'Burst Balloons', 'H'],
    ['regular-expression-matching', 'Regular Expression Matching', 'H'],
  ]],
  ['Tries', [
    ['implement-trie-prefix-tree', 'Implement Trie (Prefix Tree)', 'M'],
    ['design-add-and-search-words-data-structure', 'Design Add and Search Words Data Structure', 'M'],
    ['word-search-ii', 'Word Search II', 'H'],
  ]],
  ['Bit manipulation', [
    ['single-number', 'Single Number', 'E'],
    ['number-of-1-bits', 'Number of 1 Bits', 'E'],
    ['counting-bits', 'Counting Bits', 'E'],
    ['missing-number', 'Missing Number', 'E'],
    ['reverse-bits', 'Reverse Bits', 'E'],
    ['sum-of-two-integers', 'Sum of Two Integers', 'M'],
  ]],
];

export const PROBLEMS: Problem[] = RAW.flatMap(([topic, rows]) =>
  rows.map(([slug, title, d]) => ({ id: slug, title, topic, difficulty: D[d], url: `https://leetcode.com/problems/${slug}/` })),
);
export const TOPICS: string[] = RAW.map(([t]) => t);
export const PROBLEM_IDS = new Set(PROBLEMS.map((p) => p.id));
export const topicSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Companies students can report. A fixed list keeps the data clean (no spelling variants, no spam names). */
export const COMPANIES = [
  'Amazon', 'Microsoft', 'Google', 'Meta', 'Apple', 'Adobe', 'Flipkart', 'Walmart', 'Uber', 'Oracle', 'Samsung', 'Atlassian',
  'Salesforce', 'Goldman Sachs', 'JP Morgan', 'Morgan Stanley', 'Intuit', 'Cisco', 'Qualcomm', 'ServiceNow', 'Paytm',
  'PhonePe', 'Swiggy', 'Zomato', 'Razorpay', 'TCS', 'Infosys', 'Wipro', 'Accenture', 'Cognizant', 'Capgemini', 'Deloitte',
  'HCLTech', 'Tech Mahindra', 'Other startup',
] as const;
export const companySlug = topicSlug;

export type Progress = { id: string; solvedAt: number | null; revise: boolean };

/** Per-topic and per-difficulty counts for progress bars. */
export function summarize(solved: Set<string>) {
  const byTopic = TOPICS.map((t) => {
    const ps = PROBLEMS.filter((p) => p.topic === t);
    return { topic: t, total: ps.length, done: ps.filter((p) => solved.has(p.id)).length };
  });
  const byDifficulty = (['Easy', 'Medium', 'Hard'] as const).map((d) => {
    const ps = PROBLEMS.filter((p) => p.difficulty === d);
    return { difficulty: d, total: ps.length, done: ps.filter((p) => solved.has(p.id)).length };
  });
  return { total: PROBLEMS.length, done: PROBLEMS.filter((p) => solved.has(p.id)).length, byTopic, byDifficulty };
}

const IST = 330 * 60_000;
/** India-time day number (days since 1970) for streaks. */
export const istDay = (ms: number) => Math.floor((ms + IST) / 86_400_000);

/** Longest and current run of days with at least one solve (India time). */
export function streaks(solveTimes: number[], now = Date.now()) {
  const days = [...new Set(solveTimes.map(istDay))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = -2;
  for (const d of days) { run = d === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const today = istDay(now);
  const last = days[days.length - 1];
  const current = last === today || last === today - 1 ? run : 0;
  return { best, current };
}

export type Badge = { id: string; name: string; desc: string; earned: boolean; progress?: string };

/** Badges, computed from progress (nothing extra is stored). Order: milestones, difficulty, topics, streaks. */
export function badges(progress: Progress[], now = Date.now()): Badge[] {
  const solved = progress.filter((p) => p.solvedAt);
  const ids = new Set(solved.map((p) => p.id));
  const s = summarize(ids);
  const hard = s.byDifficulty.find((d) => d.difficulty === 'Hard')!;
  const st = streaks(solved.map((p) => p.solvedAt!), now);
  const n = s.done;
  const out: Badge[] = [
    { id: 'first', name: 'First step', desc: 'Solve your first problem', earned: n >= 1 },
    ...[25, 50, 100].map((k) => ({ id: `solved-${k}`, name: `${k} solved`, desc: `Solve ${k} problems`, earned: n >= k, progress: `${Math.min(n, k)}/${k}` })),
    { id: 'sheet', name: 'Sheet complete', desc: 'Solve every problem on the sheet', earned: n === s.total, progress: `${n}/${s.total}` },
    { id: 'hard-5', name: 'Hard hitter', desc: 'Solve 5 hard problems', earned: hard.done >= 5, progress: `${Math.min(hard.done, 5)}/5` },
    ...s.byTopic.map((t) => ({ id: `topic-${topicSlug(t.topic)}`, name: `${t.topic} master`, desc: `Solve all ${t.total} ${t.topic.toLowerCase()} problems`, earned: t.done === t.total, progress: `${t.done}/${t.total}` })),
    { id: 'streak-3', name: '3-day streak', desc: 'Solve at least one problem 3 days in a row', earned: st.best >= 3, progress: `best ${st.best}` },
    { id: 'streak-7', name: '7-day streak', desc: 'Solve at least one problem 7 days in a row', earned: st.best >= 7, progress: `best ${st.best}` },
    { id: 'streak-30', name: '30-day streak', desc: 'Solve at least one problem 30 days in a row', earned: st.best >= 30, progress: `best ${st.best}` },
  ];
  return out;
}

/** Solves per week for the last `n` weeks (India time, weeks start Monday), oldest first. */
export function weeklySolves(solveTimes: number[], n = 12, now = Date.now()) {
  const today = istDay(now);
  // 1970-01-01 was a Thursday; Monday-based week start for day d is d - ((d + 3) % 7).
  const thisWeek = today - ((today + 3) % 7);
  const weeks = Array.from({ length: n }, (_, i) => thisWeek - (n - 1 - i) * 7);
  const counts = new Map(weeks.map((w) => [w, 0]));
  for (const t of solveTimes) { const d = istDay(t); const w = d - ((d + 3) % 7); if (counts.has(w)) counts.set(w, counts.get(w)! + 1); }
  return weeks.map((w) => {
    const date = new Date(w * 86_400_000);
    return { label: `${date.getUTCDate()} ${date.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}`, value: counts.get(w)! };
  });
}
