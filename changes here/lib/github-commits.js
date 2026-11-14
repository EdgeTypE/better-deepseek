export const DEFAULT_GITHUB_COMMIT_COUNT = 100;
export const MIN_GITHUB_COMMIT_COUNT = 1;
export const GITHUB_COMMITS_PAGE_SIZE = 100;

export function normalizeGitHubCommitCount(
  count,
  fallback = DEFAULT_GITHUB_COMMIT_COUNT,
) {
  const fallbackValue = Number.parseInt(String(fallback), 10);
  const safeFallback = Number.isFinite(fallbackValue)
    ? fallbackValue
    : DEFAULT_GITHUB_COMMIT_COUNT;
  const parsed = Number.parseInt(String(count), 10);
  const normalized = Number.isFinite(parsed) ? parsed : safeFallback;
  return Math.max(MIN_GITHUB_COMMIT_COUNT, normalized);
}
