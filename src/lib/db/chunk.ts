/**
 * D1 allows at most 100 bound values per SQL statement. Queries that take a list of ids (`inArray`) run in chunks
 * through this helper so they keep working as the site grows.
 */
export const D1_MAX_IDS = 90;

export async function chunked<T, R>(items: T[], run: (part: T[]) => Promise<R[]>, size = D1_MAX_IDS): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await run(items.slice(i, i + size))));
  return out;
}
