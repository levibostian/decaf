/**
 * Represents a Git commit with all its metadata and statistics
 */
export interface GitCommit {
  /** The commit title/subject line (first line of commit message) */
  title: string
  /** The full SHA hash of the commit */
  sha: string
  /** The complete commit message body */
  message: string
  /** The commit message split into individual lines */
  messageLines: string[]
  /** Information about the commit author */
  author: {
    /** The author's display name */
    name: string
    /** The author's email address */
    email: string
  }
  /** Information about the commit committer (may differ from author) */
  committer: {
    /** The committer's display name */
    name: string
    /** The committer's email address */
    email: string
  }
  /** The timestamp when the commit was created */
  date: Date
  /** Array of file paths that were modified in this commit */
  filesChanged: string[]
  /** Whether this commit is a merge commit (has multiple parents) */
  isMergeCommit: boolean
  /** Whether this commit is a revert commit (title starts with "Revert") */
  isRevertCommit: boolean
  /** Array of parent commit SHA hashes */
  parents: string[]
  /**
   * The branch this commit belongs to (extracted from refs using two-tier selection).
   * Prefers local branches (e.g., "main", "feature-auth") over remote branches
   * (e.g., "origin/main", "upstream/develop"). If no local branches are found,
   * falls back to remote branches. Excludes tags and HEAD references.
   * May be undefined if no suitable branch reference is found.
   */
  branch?: string
  /** Array of git tags associated with this commit */
  tags?: string[]
  /** Array of all git references (branches, tags, HEAD) for this commit */
  refs?: string[]
  /** Summary statistics of line changes in this commit */
  stats?: {
    /** Total number of lines added */
    additions: number
    /** Total number of lines deleted */
    deletions: number
    /** Total number of lines changed (additions + deletions) */
    total: number
  }
  /** Per-file statistics of changes in this commit */
  fileStats?: Array<{
    /** The file path that was modified */
    filename: string
    /** Number of lines added in this file (tip: binary files may show 0 additions) */
    additions: number
    /** Number of lines deleted in this file (tip: binary files may show 0 deletions) */
    deletions: number
  }>
}
