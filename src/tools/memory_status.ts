import { tool } from "@opencode-ai/plugin"
import {
  getMemoryDir,
  getGlobalDir,
  checkIndexSize,
  listMemoryFiles,
  findStaleFiles,
} from "../storage.js"
import { findDuplicateLines, findOverlappingFiles, findOvergrownFiles } from "../compact.js"
import { existsSync, readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

function dirStats(dir: string): { fileCount: number; totalSize: number } {
  if (!existsSync(dir)) return { fileCount: 0, totalSize: 0 }
  let fileCount = 0
  let totalSize = 0
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    fileCount++
    totalSize += Buffer.byteLength(readFileSync(join(dir, f), "utf-8"), "utf-8")
  }
  return { fileCount, totalSize }
}

export const memory_status = tool({
  description:
    "Get a health report of the memory system: file counts, sizes, index usage, " +
    "stale files, duplicates, and overgrown files. Use this for a quick overview " +
    "of memory health across both scopes.",
  args: {},
  async execute(_args, ctx) {
    const sections: string[] = []

    for (const scope of ["global", "project"] as const) {
      const dir = scope === "global" ? getGlobalDir() : getMemoryDir(ctx.directory, scope)
      const stats = dirStats(dir)
      const sizeStr = stats.totalSize > 1024
        ? `${Math.round(stats.totalSize / 1024)}KB`
        : `${stats.totalSize}B`

      const lines: string[] = [
        `${scope.toUpperCase()} — ${stats.fileCount} files, ${sizeStr} total`,
      ]

      const indexWarning = checkIndexSize(ctx.directory, scope)
      if (indexWarning) {
        lines.push(`  Index: ${indexWarning}`)
      } else {
        const indexPath = join(dir, "MEMORY.md")
        if (existsSync(indexPath)) {
          const content = readFileSync(indexPath, "utf-8")
          const lineCount = content.split("\n").length
          lines.push(`  Index: ${lineCount}/200 lines`)
        } else {
          lines.push(`  Index: empty`)
        }
      }

      const stale = findStaleFiles(ctx.directory, scope, 90)
      if (stale.length > 0) {
        lines.push(`  Stale: ${stale.length} file(s) not updated in 90+ days`)
      }

      const duplicates = findDuplicateLines(ctx.directory, scope)
      if (duplicates.length > 0) {
        lines.push(`  Duplicates: ${duplicates.length} duplicate line(s) across files`)
      }

      const overlaps = findOverlappingFiles(ctx.directory, scope)
      if (overlaps.length > 0) {
        lines.push(`  Overlapping: ${overlaps.length} file pair(s) with >50% overlap`)
      }

      const overgrown = findOvergrownFiles(ctx.directory, scope)
      if (overgrown.length > 0) {
        lines.push(`  Overgrown: ${overgrown.map((o) => o.name).join(", ")}`)
      }

      sections.push(lines.join("\n"))
    }

    return `Memory status:\n\n${sections.join("\n\n")}`
  },
})
