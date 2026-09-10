import { createHash } from "crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join, resolve } from "path"
import { execSync } from "child_process"
import { homedir } from "os"

const MAX_INDEX_LINES = 200
const MAX_INDEX_BYTES = 25 * 1024 // 25KB
const MAX_SEARCH_RESULTS = 50

// Strict filename: alphanumeric, dots, hyphens, underscores. Must end with .md
const VALID_FILENAME = /^[a-zA-Z0-9._-]+\.md$/

export type MemoryScope = "project" | "global"

// ── Validation ──────────────────────────────────────────────

/** Validate a memory filename. Rejects path traversal, absolute paths, subdirectories. */
export function validateFilename(filename: string): void {
  if (!VALID_FILENAME.test(filename)) {
    throw new Error(
      `Invalid memory filename: '${filename}'. ` +
      `Must match [a-zA-Z0-9._-]+.md (no paths, no subdirectories).`
    )
  }
}

// ── Project identification ──────────────────────────────────

function getProjectRoot(directory: string): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: directory,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch {
    return resolve(directory)
  }
}

function projectDirName(projectRoot: string): string {
  const hash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 8)
  const slug = projectRoot.replace(/\//g, "-").replace(/^-/, "")
  return `${hash}-${slug}`
}

// ── Directory helpers ───────────────────────────────────────

/** Base memory directory: ~/.config/opencode/memory/ */
export function getMemoryBaseDir(): string {
  const configDir =
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(configDir, "opencode", "memory")
}

/** Global memory directory: ~/.config/opencode/memory/global/ */
export function getGlobalDir(): string {
  return join(getMemoryBaseDir(), "global")
}

/** Project memory directory: ~/.config/opencode/memory/projects/<hash>/ */
export function getProjectDir(directory: string): string {
  const root = getProjectRoot(directory)
  return join(getMemoryBaseDir(), "projects", projectDirName(root))
}

/** Get memory directory for a given scope. */
export function getMemoryDir(directory: string, scope: MemoryScope = "project"): string {
  return scope === "global" ? getGlobalDir() : getProjectDir(directory)
}

/** Ensure the memory directory exists for a given scope. */
export function ensureMemoryDir(directory: string, scope: MemoryScope = "project"): string {
  const dir = getMemoryDir(directory, scope)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ── Read / Write ────────────────────────────────────────────

/** Read the MEMORY.md index, respecting the 200-line / 25KB cap. */
export function readIndex(directory: string, scope: MemoryScope = "project"): string {
  const indexPath = join(getMemoryDir(directory, scope), "MEMORY.md")
  if (!existsSync(indexPath)) return ""

  const content = readFileSync(indexPath, "utf-8")
  const lines = content.split("\n")
  const capped = lines.slice(0, MAX_INDEX_LINES).join("\n")

  if (Buffer.byteLength(capped, "utf-8") > MAX_INDEX_BYTES) {
    return capped.slice(0, MAX_INDEX_BYTES)
  }
  return capped
}

/** Check if MEMORY.md is near its limits. Returns a warning or null. */
export function checkIndexSize(directory: string, scope: MemoryScope = "project"): string | null {
  const indexPath = join(getMemoryDir(directory, scope), "MEMORY.md")
  if (!existsSync(indexPath)) return null

  const content = readFileSync(indexPath, "utf-8")
  const lineCount = content.split("\n").length
  const byteSize = Buffer.byteLength(content, "utf-8")

  if (lineCount > MAX_INDEX_LINES) {
    return `MEMORY.md has ${lineCount} lines (limit: ${MAX_INDEX_LINES}). Content past line ${MAX_INDEX_LINES} is not loaded. Rewrite the index: keep one line per entry, move detail into topic files, merge or drop stale entries.`
  }
  if (lineCount > MAX_INDEX_LINES * 0.85) {
    return `MEMORY.md is at ${lineCount}/${MAX_INDEX_LINES} lines. Consider moving detail into topic files to keep the index concise.`
  }
  if (byteSize > MAX_INDEX_BYTES) {
    return `MEMORY.md is ${Math.round(byteSize / 1024)}KB (limit: 25KB). Shorten entries or split into topic files.`
  }
  return null
}

/** Read a memory file. */
export function readMemoryFile(
  directory: string,
  filename: string,
  scope: MemoryScope = "project"
): string | null {
  validateFilename(filename)
  const filePath = join(getMemoryDir(directory, scope), filename)
  if (!existsSync(filePath)) return null
  return readFileSync(filePath, "utf-8")
}

/** Write a memory file (overwrite). */
export function writeMemoryFile(
  directory: string,
  filename: string,
  content: string,
  scope: MemoryScope = "project"
): void {
  validateFilename(filename)
  const dir = ensureMemoryDir(directory, scope)
  writeFileSync(join(dir, filename), content, "utf-8")
}

/** Append content to a memory file. */
export function appendMemoryFile(
  directory: string,
  filename: string,
  content: string,
  scope: MemoryScope = "project"
): void {
  validateFilename(filename)
  const dir = ensureMemoryDir(directory, scope)
  const filePath = join(dir, filename)
  const existing = existsSync(filePath)
    ? readFileSync(filePath, "utf-8")
    : ""
  const separator = existing && !existing.endsWith("\n") ? "\n" : ""
  writeFileSync(filePath, existing + separator + content, "utf-8")
}

/** Delete a memory file. */
export function deleteMemoryFile(
  directory: string,
  filename: string,
  scope: MemoryScope = "project"
): boolean {
  validateFilename(filename)
  const filePath = join(getMemoryDir(directory, scope), filename)
  if (!existsSync(filePath)) return false
  const { unlinkSync } = require("fs")
  unlinkSync(filePath)
  return true
}

// ── List ────────────────────────────────────────────────────

/** List all memory files with optional one-line previews. */
export function listMemoryFiles(
  directory: string,
  scope: MemoryScope = "project"
): Array<{ name: string; size: number; preview: string }> {
  const dir = getMemoryDir(directory, scope)
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((name) => {
      const filePath = join(dir, name)
      const content = readFileSync(filePath, "utf-8")
      const lines = content.split("\n").filter((l) => l.trim())
      const preview = lines[0]?.slice(0, 100) || "(empty)"
      return {
        name,
        size: Buffer.byteLength(content, "utf-8"),
        preview,
      }
    })
}

// ── Search ──────────────────────────────────────────────────

type SearchResult = { file: string; line: number; text: string }
type CrossProjectResult = SearchResult & { project: string }

function searchDir(
  dir: string,
  regex: RegExp,
  limit: number
): SearchResult[] {
  if (!existsSync(dir)) return []
  const results: SearchResult[] = []

  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const content = readFileSync(join(dir, name), "utf-8")
    for (const [i, text] of content.split("\n").entries()) {
      if (regex.test(text)) {
        results.push({ file: name, line: i + 1, text: text.trim() })
        if (results.length >= limit) return results
      }
    }
  }
  return results
}

/** Search current project's memory files. */
export function searchMemory(
  directory: string,
  pattern: string,
  scope: MemoryScope = "project"
): SearchResult[] {
  const regex = new RegExp(pattern, "i")
  const dir = getMemoryDir(directory, scope)
  return searchDir(dir, regex, MAX_SEARCH_RESULTS)
}

/** Search across ALL projects' + global memory. */
export function searchAllMemory(
  pattern: string
): CrossProjectResult[] {
  const baseDir = getMemoryBaseDir()
  if (!existsSync(baseDir)) return []

  const regex = new RegExp(pattern, "i")
  const results: CrossProjectResult[] = []
  let remaining = MAX_SEARCH_RESULTS

  // Search global first
  const globalDir = join(baseDir, "global")
  if (existsSync(globalDir)) {
    for (const r of searchDir(globalDir, regex, remaining)) {
      results.push({ ...r, project: "global" })
    }
    remaining = MAX_SEARCH_RESULTS - results.length
  }

  // Search all project directories
  const projectsDir = join(baseDir, "projects")
  if (existsSync(projectsDir) && remaining > 0) {
    for (const projectDir of readdirSync(projectsDir)) {
      if (remaining <= 0) break
      const projectPath = join(projectsDir, projectDir)
      try {
        for (const r of searchDir(projectPath, regex, remaining)) {
          results.push({ ...r, project: projectDir })
        }
        remaining = MAX_SEARCH_RESULTS - results.length
      } catch {
        // Skip non-directory entries
      }
    }
  }

  // Also search legacy flat directories (pre-0.2 layout)
  if (remaining > 0) {
    try {
      for (const entry of readdirSync(baseDir)) {
        if (entry === "global" || entry === "projects") continue
        if (remaining <= 0) break
        const entryPath = join(baseDir, entry)
        try {
          for (const r of searchDir(entryPath, regex, remaining)) {
            results.push({ ...r, project: `legacy:${entry}` })
          }
          remaining = MAX_SEARCH_RESULTS - results.length
        } catch {
          // Skip non-directory entries
        }
      }
    } catch {
      // base dir listing failed
    }
  }

  return results
}
