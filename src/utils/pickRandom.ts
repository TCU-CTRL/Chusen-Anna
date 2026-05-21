/**
 * Fisher-Yates shuffle ベースで candidates から count 人を重複なしで選出する。
 * 入力配列は変更しない（immutable）。
 */
export function pickRandom<T>(
  candidates: readonly T[],
  count: number,
): T[] {
  if (!Number.isInteger(count)) {
    throw new RangeError(
      `count must be an integer, got ${count}`,
    );
  }
  if (count < 1) {
    throw new RangeError(
      `count must be >= 1, got ${count}`,
    );
  }
  if (count > candidates.length) {
    throw new RangeError(
      `count (${count}) exceeds candidates length (${candidates.length})`,
    );
  }

  // Copy to avoid mutating the original
  const pool = [...candidates];

  // Partial Fisher-Yates: only shuffle the first `count` positions
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
}
