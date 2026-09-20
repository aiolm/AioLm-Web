/**
 * The project's real, public destinations. Kept in one module so a link can
 * never drift between the header, the footer and the explorer empty state.
 */
export const GITHUB_REPOSITORY_URL = "https://github.com/joowon-jang/AioLM";
export const GITHUB_DOCS_URL = "https://github.com/joowon-jang/AioLM/tree/main/docs";
export const GITHUB_LICENSE_URL = "https://github.com/joowon-jang/AioLM/blob/main/LICENSE";

/** GitHub's mark, inline so the header costs no extra request. */
export function GitHubMark(): React.JSX.Element {
  return (
    <svg className="github-mark" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

/** Marks a link that leaves the site, for sighted and screen reader users alike. */
export function ExternalHint(): React.JSX.Element {
  return (
    <>
      <span aria-hidden="true"> ↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </>
  );
}
