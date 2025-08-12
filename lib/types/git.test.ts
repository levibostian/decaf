import { GitCommit } from "./git.ts"

export class GitCommitFake implements GitCommit {
  title: string
  sha: string
  abbreviatedSha: string
  message: string
  messageLines: string[]
  author: { name: string; email: string }
  committer: { name: string; email: string }
  date: Date
  filesChanged: string[]
  isMergeCommit: boolean
  isRevertCommit: boolean
  parents: string[]
  branch?: string | undefined
  tags?: string[] | undefined
  refs?: string[] | undefined
  stats?: { additions: number; deletions: number; total: number } | undefined
  fileStats?: { filename: string; additions: number; deletions: number }[] | undefined

  constructor({
    sha = "abc123",
    message = "chore: does not trigger a release",
    date = new Date("2021-01-01T00:00:00Z"),
  }: Partial<GitCommit> = {}) {
    this.sha = sha
    this.abbreviatedSha = sha.substring(0, 8)
    this.message = message
    this.date = date
    this.messageLines = message.split("\n")
    this.title = this.messageLines[0]
    this.author = { name: "Test Author", email: "test@example.com" }
    this.committer = { name: "Test Committer", email: "test@example.com" }
    this.filesChanged = []
    this.isMergeCommit = false
    this.isRevertCommit = false
    this.parents = []
  }
}
