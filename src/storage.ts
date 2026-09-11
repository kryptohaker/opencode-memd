import { createHash } from "crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  cpSync,
  statSync,
} from "fs"
import { join, resolve } from "path"
import { execSync } from "child_process"
import { homedir } from "os"

const MAX_INDEX_LINES = 200
const MAX_INDEX_BYTES = 25 * 1024
const MAX_SEARCH_RESULTS = 50
const MAX_TOPIC_BYTES = 100 * 1024
const TOPIC_WARN_RATIO = 0.85

export const VALID_FILENAME = /^[a-zA-Z0-9._-]+\.md$/

export type MemoryScope = "project" | "global"

export type MemoryMeta = {
  type?: "user" | "feedback" | "project" | "reference"
  tags?: string
  created?: string
  updated?: string
  [key: string]: string | undefined
}

export type ParsedMemory = {
  metadata: MemoryMeta | null
  body: string
}

// ── Frontmatter ────────────────────────────────────────────

export function parseFrontmatter(content: string): ParsedMemory {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { metadata: null, body: content }

  const meta: MemoryMeta = {}
  for (const line of match[1].split("\n")) {
    const sep = line.indexOf(":")
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const val = line.slice(sep + 1).trim()
    if (key && val) meta[key] = val
  }
  return { metadata: meta, body: match[2] }
}

export function buildFrontmatter(meta: MemoryMeta): string {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
  return `---\n${lines.join("\n")}\n---\n`
}

// ── Validation ─────────────────────────────────────────────

export function validateFilename(filename: string): void {
  if (!VALID_FILENAME.test(filename)) {
    throw new Error(
      `Invalid memory filename: '${filename}'. ` +
        `Must match [a-zA-Z0-9._-]+.md (no paths, no subdirectories).`
    )
  }
}

// ── Project identification ─────────────────────────────────

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
  const hash = createHash("sha256")
    .update(projectRoot)
    .digest("hex")
    .slice(0, 8)
  const slug = projectRoot.replace(/\//g, "-").replace(/^-/, "")
  return `${hash}-${slug}`
}

// ── Directory helpers ──────────────────────────────────────

export function getMemoryBaseDir(): string {
  const dataDir =
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataDir, "opencode-memd")
}

function getOldMemoryBaseDir(): string {
  const configDir =
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(configDir, "opencode", "memory")
}

export function getGlobalDir(): string {
  return join(getMemoryBaseDir(), "global")
}

export function getProjectDir(directory: string): string {
  const root = getProjectRoot(directory)
  return join(getMemoryBaseDir(), "projects", projectDirName(root))
}

export function getMemoryDir(
  directory: string,
  scope: MemoryScope = "project"
): string {
  return scope === "global" ? getGlobalDir() : getProjectDir(directory)
}

export function ensureMemoryDir(
  directory: string,
  scope: MemoryScope = "project"
): string {
  const dir = getMemoryDir(directory, scope)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ── Migration ──────────────────────────────────────────────

export function migrateFromOldLocation(): void {
  const oldBase = getOldMemoryBaseDir()
  const newBase = getMemoryBaseDir()

  if (!existsSync(oldBase)) return
  if (existsSync(newBase)) return

  try {
    const entries = readdirSync(oldBase)
    if (entries.length === 0) return

    mkdirSync(newBase, { recursive: true })
    cpSync(oldBase, newBase, { recursive: true })
    console.log(
      `opencode-memd: migrated memory from ${oldBase} → ${newBase}`
    )
  } catch (err) {
    console.error(`opencode-memd: migration failed:`, err)
  }
}

// ── Read / Write ───────────────────────────────────────────

export function readIndex(
  directory: string,
  scope: MemoryScope = "project"
): string {
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

export function checkIndexSize(
  directory: string,
  scope: MemoryScope = "project"
): string | null {
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

export function checkTopicSize(
  directory: string,
  filename: string,
  scope: MemoryScope = "project"
): string | null {
  const filePath = join(getMemoryDir(directory, scope), filename)
  if (!existsSync(filePath)) return null

  const byteSize = Buffer.byteLength(readFileSync(filePath, "utf-8"), "utf-8")
  if (byteSize > MAX_TOPIC_BYTES) {
    return `${filename} is ${Math.round(byteSize / 1024)}KB (limit: 100KB). Split into smaller topic files.`
  }
  if (byteSize > MAX_TOPIC_BYTES * TOPIC_WARN_RATIO) {
    return `${filename} is ${Math.round(byteSize / 1024)}KB (approaching 100KB limit). Consider splitting into smaller files.`
  }
  return null
}

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

export function writeMemoryFile(
  directory: string,
  filename: string,
  content: string,
  scope: MemoryScope = "project"
): void {
  validateFilename(filename)
  const dir = ensureMemoryDir(directory, scope)
  const filePath = join(dir, filename)
  const isIndex = filename === "MEMORY.md"

  if (isIndex) {
    writeFileSync(filePath, content, "utf-8")
    return
  }

  const now = new Date().toISOString()
  const parsed = parseFrontmatter(content)
  const existingContent = existsSync(filePath)
    ? readFileSync(filePath, "utf-8")
    : null
  const existingParsed = existingContent
    ? parseFrontmatter(existingContent)
    : null

  if (parsed.metadata) {
    if (!parsed.metadata.created) {
      parsed.metadata.created =
        existingParsed?.metadata?.created || now
    }
    parsed.metadata.updated = now
    writeFileSync(
      filePath,
      buildFrontmatter(parsed.metadata) + parsed.body,
      "utf-8"
    )
  } else {
    const meta: MemoryMeta = {
      created: existingParsed?.metadata?.created || now,
      updated: now,
    }
    writeFileSync(filePath, buildFrontmatter(meta) + content, "utf-8")
  }
}

export function appendMemoryFile(
  directory: string,
  filename: string,
  content: string,
  scope: MemoryScope = "project"
): void {
  validateFilename(filename)
  const dir = ensureMemoryDir(directory, scope)
  const filePath = join(dir, filename)
  const isIndex = filename === "MEMORY.md"

  if (isIndex) {
    const existing = existsSync(filePath)
      ? readFileSync(filePath, "utf-8")
      : ""
    const separator = existing && !existing.endsWith("\n") ? "\n" : ""
    writeFileSync(filePath, existing + separator + content, "utf-8")
    return
  }

  const now = new Date().toISOString()
  const existing = existsSync(filePath)
    ? readFileSync(filePath, "utf-8")
    : ""
  const parsed = parseFrontmatter(existing)

  const meta: MemoryMeta = {
    ...parsed.metadata,
    created: parsed.metadata?.created || now,
    updated: now,
  }

  const body = parsed.body || ""
  const separator = body && !body.endsWith("\n") ? "\n" : ""
  writeFileSync(
    filePath,
    buildFrontmatter(meta) + body + separator + content,
    "utf-8"
  )
}

export function deleteMemoryFile(
  directory: string,
  filename: string,
  scope: MemoryScope = "project"
): boolean {
  validateFilename(filename)
  const filePath = join(getMemoryDir(directory, scope), filename)
  if (!existsSync(filePath)) return false
  unlinkSync(filePath)
  return true
}

// ── Tags ──────────────────────────────────────────────────

export function parseTags(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
}

export function formatTags(tags: string[]): string {
  return tags.join(", ")
}

// ── List ───────────────────────────────────────────────────

export function listMemoryFiles(
  directory: string,
  scope: MemoryScope = "project",
  filterTag?: string
): Array<{
  name: string
  size: number
  preview: string
  type?: string
  tags: string[]
}> {
  const dir = getMemoryDir(directory, scope)
  if (!existsSync(dir)) return []

  const normalizedFilter = filterTag?.trim().toLowerCase()

  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((name) => {
      const filePath = join(dir, name)
      const content = readFileSync(filePath, "utf-8")
      const parsed = parseFrontmatter(content)
      const tags = parseTags(parsed.metadata?.tags)
      const bodyLines = parsed.body.split("\n").filter((l) => l.trim())
      const preview = bodyLines[0]?.slice(0, 100) || "(empty)"
      return {
        name,
        size: Buffer.byteLength(content, "utf-8"),
        preview,
        type: parsed.metadata?.type,
        tags,
      }
    })
    .filter((f) => !normalizedFilter || f.tags.includes(normalizedFilter))
}

// ── Stale detection ───────────────────────────────────────

export function findStaleFiles(
  directory: string,
  scope: MemoryScope = "project",
  staleDays: number = 90
): Array<{
  name: string
  type?: string
  tags: string[]
  lastUpdated: string
  daysStale: number
  size: number
  preview: string
}> {
  const dir = getMemoryDir(directory, scope)
  if (!existsSync(dir)) return []

  const now = Date.now()
  const cutoff = staleDays * 24 * 60 * 60 * 1000
  const results: Array<{
    name: string
    type?: string
    tags: string[]
    lastUpdated: string
    daysStale: number
    size: number
    preview: string
  }> = []

  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    if (name === "MEMORY.md") continue
    const filePath = join(dir, name)
    const content = readFileSync(filePath, "utf-8")
    const parsed = parseFrontmatter(content)

    let fileTime: number
    if (parsed.metadata?.updated) {
      fileTime = new Date(parsed.metadata.updated).getTime()
    } else if (parsed.metadata?.created) {
      fileTime = new Date(parsed.metadata.created).getTime()
    } else {
      fileTime = statSync(filePath).mtimeMs
    }

    const age = now - fileTime
    if (age > cutoff) {
      const bodyLines = parsed.body.split("\n").filter((l) => l.trim())
      results.push({
        name,
        type: parsed.metadata?.type,
        tags: parseTags(parsed.metadata?.tags),
        lastUpdated: parsed.metadata?.updated || parsed.metadata?.created || new Date(fileTime).toISOString(),
        daysStale: Math.floor(age / (24 * 60 * 60 * 1000)),
        size: Buffer.byteLength(content, "utf-8"),
        preview: bodyLines[0]?.slice(0, 100) || "(empty)",
      })
    }
  }

  return results.sort((a, b) => b.daysStale - a.daysStale)
}

export function archiveMemoryFile(
  directory: string,
  filename: string,
  scope: MemoryScope = "project"
): boolean {
  validateFilename(filename)
  if (filename === "MEMORY.md") return false

  const dir = getMemoryDir(directory, scope)
  const filePath = join(dir, filename)
  if (!existsSync(filePath)) return false

  const archiveDir = join(dir, ".archive")
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const archiveName = `${filename.replace(/\.md$/, "")}_${timestamp}.md`
  const content = readFileSync(filePath, "utf-8")
  writeFileSync(join(archiveDir, archiveName), content, "utf-8")
  unlinkSync(filePath)
  return true
}

// ── Projects ───────────────────────────────────────────────

export function listProjects(): Array<{
  dirName: string
  path: string
  fileCount: number
  totalSize: number
}> {
  const baseDir = getMemoryBaseDir()
  const results: Array<{
    dirName: string
    path: string
    fileCount: number
    totalSize: number
  }> = []

  const projectsDir = join(baseDir, "projects")
  if (existsSync(projectsDir)) {
    for (const dirName of readdirSync(projectsDir)) {
      const fullPath = join(projectsDir, dirName)
      try {
        const stat = statSync(fullPath)
        if (!stat.isDirectory()) continue
      } catch {
        continue
      }

      const dashIdx = dirName.indexOf("-")
      const slug =
        dashIdx !== -1 ? "/" + dirName.slice(dashIdx + 1).replace(/-/g, "/") : dirName

      let fileCount = 0
      let totalSize = 0
      try {
        for (const f of readdirSync(fullPath).filter((f) =>
          f.endsWith(".md")
        )) {
          fileCount++
          totalSize += Buffer.byteLength(
            readFileSync(join(fullPath, f), "utf-8"),
            "utf-8"
          )
        }
      } catch {
        // skip unreadable dirs
      }

      results.push({ dirName, path: slug, fileCount, totalSize })
    }
  }

  // Legacy flat directories
  if (existsSync(baseDir)) {
    for (const entry of readdirSync(baseDir)) {
      if (entry === "global" || entry === "projects") continue
      const fullPath = join(baseDir, entry)
      try {
        const stat = statSync(fullPath)
        if (!stat.isDirectory()) continue
      } catch {
        continue
      }

      let fileCount = 0
      let totalSize = 0
      try {
        for (const f of readdirSync(fullPath).filter((f) =>
          f.endsWith(".md")
        )) {
          fileCount++
          totalSize += Buffer.byteLength(
            readFileSync(join(fullPath, f), "utf-8"),
            "utf-8"
          )
        }
      } catch {
        // skip
      }

      results.push({
        dirName: entry,
        path: `(legacy) /${entry.replace(/-/g, "/")}`,
        fileCount,
        totalSize,
      })
    }
  }

  return results
}

// ── Search ─────────────────────────────────────────────────

import { scoreLine, extractWords } from "./fuzzy.js"

type SearchResult = { file: string; line: number; text: string }
type CrossProjectResult = SearchResult & { project: string }

function normalizeForSearch(text: string): string {
  return text.replace(/[-_.]/g, " ").toLowerCase()
}

function extractTerms(pattern: string): string[] {
  return pattern
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

function searchDir(
  dir: string,
  regex: RegExp,
  terms: string[],
  limit: number,
  fuzzy: boolean = true
): SearchResult[] {
  if (!existsSync(dir)) return []
  const results: SearchResult[] = []
  const seen = new Set<string>()
  const filesWithHits = new Set<string>()

  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    // 1. Match against filename (normalize hyphens/underscores to spaces)
    const normalizedName = normalizeForSearch(name)
    const filenameMatches = terms.length > 0
      ? terms.every((t) => normalizedName.includes(t))
      : regex.test(name)

    if (filenameMatches && !seen.has(name)) {
      seen.add(name)
      filesWithHits.add(name)
      results.push({ file: name, line: 0, text: `(filename match: ${name})` })
      if (results.length >= limit) return results
    }

    // 2. Match against content line-by-line
    const content = readFileSync(join(dir, name), "utf-8")
    const lines = content.split("\n")
    for (const [i, text] of lines.entries()) {
      if (regex.test(text)) {
        filesWithHits.add(name)
        results.push({ file: name, line: i + 1, text: text.trim() })
        if (results.length >= limit) return results
      }
    }

    // 3. Multi-term fallback: if no line matched but ALL terms appear across the file
    if (terms.length > 1 && !results.some((r) => r.file === name && r.line > 0)) {
      const lowerContent = content.toLowerCase()
      if (terms.every((t) => lowerContent.includes(t))) {
        filesWithHits.add(name)
        const preview = lines.find((l) => l.trim())?.trim().slice(0, 100) || "(no preview)"
        results.push({ file: name, line: 0, text: `(multi-term match: ${preview})` })
        if (results.length >= limit) return results
      }
    }
  }

  // 4. Fuzzy fallback: only if exact layers found < 5 results
  if (fuzzy && terms.length > 0 && results.length < 5) {
    const fuzzyResults: Array<SearchResult & { score: number }> = []

    for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      if (filesWithHits.has(name)) continue
      const content = readFileSync(join(dir, name), "utf-8")
      const lines = content.split("\n")

      for (const [i, text] of lines.entries()) {
        if (!text.trim() || text.startsWith("---")) continue
        const words = extractWords(text)
        const score = scoreLine(terms, words)
        if (score > 0.5) {
          fuzzyResults.push({
            file: name,
            line: i + 1,
            text: `(fuzzy ${Math.round(score * 100)}%) ${text.trim()}`,
            score,
          })
        }
      }
    }

    fuzzyResults.sort((a, b) => b.score - a.score)
    const remaining = limit - results.length
    for (const r of fuzzyResults.slice(0, remaining)) {
      results.push({ file: r.file, line: r.line, text: r.text })
    }
  }

  return results
}

export function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "i")
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
  }
}

export function searchMemory(
  directory: string,
  pattern: string,
  scope: MemoryScope = "project",
  fuzzy: boolean = true
): SearchResult[] {
  const regex = safeRegex(pattern)
  const terms = extractTerms(pattern)
  const dir = getMemoryDir(directory, scope)
  return searchDir(dir, regex, terms, MAX_SEARCH_RESULTS, fuzzy)
}

export function searchAllMemory(pattern: string, fuzzy: boolean = true): CrossProjectResult[] {
  const baseDir = getMemoryBaseDir()
  if (!existsSync(baseDir)) return []

  const regex = safeRegex(pattern)
  const terms = extractTerms(pattern)
  const results: CrossProjectResult[] = []
  let remaining = MAX_SEARCH_RESULTS

  const globalDir = join(baseDir, "global")
  if (existsSync(globalDir)) {
    for (const r of searchDir(globalDir, regex, terms, remaining, fuzzy)) {
      results.push({ ...r, project: "global" })
    }
    remaining = MAX_SEARCH_RESULTS - results.length
  }

  const projectsDir = join(baseDir, "projects")
  if (existsSync(projectsDir) && remaining > 0) {
    for (const projectDir of readdirSync(projectsDir)) {
      if (remaining <= 0) break
      const projectPath = join(projectsDir, projectDir)
      try {
        const stat = statSync(projectPath)
        if (!stat.isDirectory()) continue
        for (const r of searchDir(projectPath, regex, terms, remaining, fuzzy)) {
          results.push({ ...r, project: projectDir })
        }
        remaining = MAX_SEARCH_RESULTS - results.length
      } catch {
        // skip
      }
    }
  }

  // Legacy flat directories
  if (remaining > 0) {
    try {
      for (const entry of readdirSync(baseDir)) {
        if (entry === "global" || entry === "projects") continue
        if (remaining <= 0) break
        const entryPath = join(baseDir, entry)
        try {
          const stat = statSync(entryPath)
          if (!stat.isDirectory()) continue
          for (const r of searchDir(entryPath, regex, terms, remaining, fuzzy)) {
            results.push({ ...r, project: `legacy:${entry}` })
          }
          remaining = MAX_SEARCH_RESULTS - results.length
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }

  return results
}
