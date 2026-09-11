import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs"
import { join } from "path"
import {
  getMemoryDir,
  parseFrontmatter,
  buildFrontmatter,
  parseTags,
  formatTags,
  archiveMemoryFile,
  type MemoryScope,
  type MemoryMeta,
} from "./storage.js"

export type DuplicateReport = {
  normalizedLine: string
  occurrences: Array<{ file: string; line: number; original: string }>
}

export type OverlapReport = {
  fileA: string
  fileB: string
  overlap: number
  sizeA: number
  sizeB: number
}

export type OvergrownReport = {
  name: string
  size: number
  lineCount: number
  isIndex: boolean
}

function normalizeForDedup(line: string): string {
  return line.trim().toLowerCase().replace(/\s+/g, " ")
}

function extractWordSet(content: string): Set<string> {
  return new Set(
    content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
}

export function findDuplicateLines(
  directory: string,
  scope: MemoryScope
): DuplicateReport[] {
  const dir = getMemoryDir(directory, scope)
  if (!existsSync(dir)) return []

  const lineMap = new Map<
    string,
    Array<{ file: string; line: number; original: string }>
  >()

  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const content = readFileSync(join(dir, name), "utf-8")
    const parsed = parseFrontmatter(content)
    const lines = parsed.body.split("\n")

    for (const [i, text] of lines.entries()) {
      const normalized = normalizeForDedup(text)
      if (normalized.length < 10) continue
      if (normalized === "---" || normalized.startsWith("#") && normalized.length < 5) continue

      const key = normalized
      if (!lineMap.has(key)) lineMap.set(key, [])
      lineMap.get(key)!.push({ file: name, line: i + 1, original: text.trim() })
    }
  }

  return Array.from(lineMap.entries())
    .filter(([, occurrences]) => {
      const uniqueFiles = new Set(occurrences.map((o) => o.file))
      return uniqueFiles.size > 1
    })
    .map(([normalizedLine, occurrences]) => ({ normalizedLine, occurrences }))
    .sort((a, b) => b.occurrences.length - a.occurrences.length)
}

export function findOverlappingFiles(
  directory: string,
  scope: MemoryScope
): OverlapReport[] {
  const dir = getMemoryDir(directory, scope)
  if (!existsSync(dir)) return []

  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".md") && f !== "MEMORY.md"
  )
  const wordSets = new Map<string, { words: Set<string>; size: number }>()

  for (const name of files) {
    const content = readFileSync(join(dir, name), "utf-8")
    const parsed = parseFrontmatter(content)
    wordSets.set(name, {
      words: extractWordSet(parsed.body),
      size: Buffer.byteLength(content, "utf-8"),
    })
  }

  const results: OverlapReport[] = []
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = wordSets.get(files[i])!
      const b = wordSets.get(files[j])!
      if (a.words.size === 0 || b.words.size === 0) continue

      let intersection = 0
      const smaller = a.words.size < b.words.size ? a.words : b.words
      const larger = a.words.size < b.words.size ? b.words : a.words
      for (const w of smaller) {
        if (larger.has(w)) intersection++
      }

      const overlap = intersection / smaller.size
      if (overlap > 0.5) {
        results.push({
          fileA: files[i],
          fileB: files[j],
          overlap,
          sizeA: a.size,
          sizeB: b.size,
        })
      }
    }
  }

  return results.sort((a, b) => b.overlap - a.overlap)
}

export function findOvergrownFiles(
  directory: string,
  scope: MemoryScope
): OvergrownReport[] {
  const dir = getMemoryDir(directory, scope)
  if (!existsSync(dir)) return []

  const results: OvergrownReport[] = []
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const content = readFileSync(join(dir, name), "utf-8")
    const size = Buffer.byteLength(content, "utf-8")
    const lineCount = content.split("\n").length
    const isIndex = name === "MEMORY.md"

    if (isIndex && lineCount > 150) {
      results.push({ name, size, lineCount, isIndex })
    } else if (!isIndex && (size > 50 * 1024 || lineCount > 100)) {
      results.push({ name, size, lineCount, isIndex })
    }
  }

  return results.sort((a, b) => b.size - a.size)
}

export function mechanicalDedup(
  directory: string,
  scope: MemoryScope,
  dryRun: boolean = true
): { linesRemoved: number; filesModified: string[] } {
  const duplicates = findDuplicateLines(directory, scope)
  if (duplicates.length === 0) return { linesRemoved: 0, filesModified: [] }

  const dir = getMemoryDir(directory, scope)
  const removals = new Map<string, Set<number>>()

  for (const dup of duplicates) {
    const keep = dup.occurrences[0]
    for (const occ of dup.occurrences.slice(1)) {
      if (!removals.has(occ.file)) removals.set(occ.file, new Set())
      removals.get(occ.file)!.add(occ.line)
    }
  }

  let linesRemoved = 0
  const filesModified: string[] = []

  for (const [file, lineNums] of removals) {
    const filePath = join(dir, file)
    const content = readFileSync(filePath, "utf-8")
    const parsed = parseFrontmatter(content)
    const lines = parsed.body.split("\n")
    const filtered = lines.filter((_, i) => !lineNums.has(i + 1))

    if (filtered.length < lines.length) {
      linesRemoved += lines.length - filtered.length
      filesModified.push(file)

      if (!dryRun) {
        const meta = parsed.metadata || {}
        meta.updated = new Date().toISOString()
        writeFileSync(
          filePath,
          buildFrontmatter(meta) + filtered.join("\n"),
          "utf-8"
        )
      }
    }
  }

  return { linesRemoved, filesModified }
}

export function mergeFiles(
  directory: string,
  scope: MemoryScope,
  sources: string[],
  target: string
): { merged: boolean; lineCount: number; sourcesArchived: string[] } {
  const dir = getMemoryDir(directory, scope)
  const allLines: string[] = []
  const seenLines = new Set<string>()
  let mergedMeta: MemoryMeta = {}
  const allTags = new Set<string>()
  let earliestCreated = ""
  let latestUpdated = ""

  for (const source of sources) {
    const filePath = join(dir, source)
    if (!existsSync(filePath)) continue

    const content = readFileSync(filePath, "utf-8")
    const parsed = parseFrontmatter(content)

    if (parsed.metadata?.type && !mergedMeta.type) {
      mergedMeta.type = parsed.metadata.type
    }
    for (const tag of parseTags(parsed.metadata?.tags)) {
      allTags.add(tag)
    }
    if (parsed.metadata?.created) {
      if (!earliestCreated || parsed.metadata.created < earliestCreated) {
        earliestCreated = parsed.metadata.created
      }
    }
    if (parsed.metadata?.updated) {
      if (!latestUpdated || parsed.metadata.updated > latestUpdated) {
        latestUpdated = parsed.metadata.updated
      }
    }

    for (const line of parsed.body.split("\n")) {
      const normalized = normalizeForDedup(line)
      if (normalized.length === 0) {
        allLines.push(line)
        continue
      }
      if (!seenLines.has(normalized)) {
        seenLines.add(normalized)
        allLines.push(line)
      }
    }
  }

  if (allTags.size > 0) mergedMeta.tags = formatTags([...allTags])
  if (earliestCreated) mergedMeta.created = earliestCreated
  mergedMeta.updated = new Date().toISOString()

  const mergedContent = buildFrontmatter(mergedMeta) + allLines.join("\n")
  writeFileSync(join(dir, target), mergedContent, "utf-8")

  const sourcesArchived: string[] = []
  for (const source of sources) {
    if (source === target) continue
    if (archiveMemoryFile(directory, source, scope)) {
      sourcesArchived.push(source)
    }
  }

  return {
    merged: true,
    lineCount: allLines.filter((l) => l.trim()).length,
    sourcesArchived,
  }
}
