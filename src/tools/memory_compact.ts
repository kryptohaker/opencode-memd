import { tool } from "@opencode-ai/plugin"
import {
  findDuplicateLines,
  findOverlappingFiles,
  findOvergrownFiles,
  mechanicalDedup,
  mergeFiles,
} from "../compact.js"
import { VALID_FILENAME } from "../storage.js"

export const memory_compact = tool({
  description:
    "Analyze memory files for duplicates, overlapping content, and overgrown files. " +
    "Use action='scan' (default) to get a report without making changes. " +
    "Use action='dedup' to remove duplicate lines across files (dry_run=true by default). " +
    "Use action='merge' to combine multiple files into one (archives the sources).",
  args: {
    action: tool.schema
      .enum(["scan", "dedup", "merge"])
      .default("scan")
      .describe("'scan' reports issues, 'dedup' removes duplicates, 'merge' combines files"),
    scope: tool.schema
      .enum(["project", "global"])
      .default("project")
      .describe("'project' (default) or 'global'"),
    dry_run: tool.schema
      .boolean()
      .default(true)
      .optional()
      .describe("For dedup: preview changes without applying (default: true)"),
    files: tool.schema
      .string()
      .optional()
      .describe("For merge: comma-separated source filenames to merge"),
    target: tool.schema
      .string()
      .optional()
      .describe("For merge: target filename for the merged result"),
  },
  async execute(args, ctx) {
    if (args.action === "dedup") {
      const result = mechanicalDedup(ctx.directory, args.scope, args.dry_run)
      if (result.linesRemoved === 0) {
        return `No duplicate lines found across ${args.scope} memory files.`
      }
      const mode = args.dry_run ? "Would remove" : "Removed"
      return `${mode} ${result.linesRemoved} duplicate line(s) from: ${result.filesModified.join(", ")}.${args.dry_run ? "\nRun with dry_run=false to apply." : ""}`
    }

    if (args.action === "merge") {
      if (!args.files || !args.target) {
        return "Provide 'files' (comma-separated source filenames) and 'target' (merged filename) for merge."
      }
      if (!VALID_FILENAME.test(args.target)) {
        return `Invalid target filename: '${args.target}'. Must match [a-zA-Z0-9._-]+.md`
      }
      const sources = args.files.split(",").map((f) => f.trim())
      for (const s of sources) {
        if (!VALID_FILENAME.test(s)) {
          return `Invalid source filename: '${s}'. Must match [a-zA-Z0-9._-]+.md`
        }
      }
      const result = mergeFiles(ctx.directory, args.scope, sources, args.target)
      if (!result.merged) {
        return "Merge failed — no source files found."
      }
      return `Merged ${sources.length} files into ${args.target} (${result.lineCount} content lines). Archived: ${result.sourcesArchived.join(", ") || "none"}.`
    }

    // scan
    const duplicates = findDuplicateLines(ctx.directory, args.scope)
    const overlaps = findOverlappingFiles(ctx.directory, args.scope)
    const overgrown = findOvergrownFiles(ctx.directory, args.scope)

    if (duplicates.length === 0 && overlaps.length === 0 && overgrown.length === 0) {
      return `No compaction issues found in ${args.scope} memory.`
    }

    const sections: string[] = [`Memory compaction scan (${args.scope} scope):\n`]

    if (duplicates.length > 0) {
      const lines = duplicates.slice(0, 10).map((d) => {
        const locs = d.occurrences.map((o) => `${o.file}:${o.line}`).join(", ")
        return `  - "${d.occurrences[0].original.slice(0, 80)}" → ${locs}`
      })
      sections.push(`Duplicate lines (${duplicates.length} found across files):\n${lines.join("\n")}`)
    }

    if (overlaps.length > 0) {
      const lines = overlaps.map(
        (o) => `  - ${o.fileA} ↔ ${o.fileB} (${Math.round(o.overlap * 100)}% overlap)`
      )
      sections.push(`Overlapping files:\n${lines.join("\n")}`)
    }

    if (overgrown.length > 0) {
      const lines = overgrown.map((o) => {
        const sizeStr = o.size > 1024 ? `${Math.round(o.size / 1024)}KB` : `${o.size}B`
        return `  - ${o.name}: ${o.lineCount} lines, ${sizeStr}${o.isIndex ? " (approaching 200-line limit)" : ""}`
      })
      sections.push(`Overgrown files:\n${lines.join("\n")}`)
    }

    const recs: string[] = []
    if (duplicates.length > 0) {
      const totalDupLines = duplicates.reduce((n, d) => n + d.occurrences.length - 1, 0)
      recs.push(`Run memory_compact action='dedup' to remove ${totalDupLines} duplicate line(s)`)
    }
    if (overlaps.length > 0) {
      recs.push(`Consider merging overlapping files with memory_compact action='merge'`)
    }
    if (overgrown.length > 0) {
      recs.push(`Consider splitting overgrown files into smaller topics`)
    }
    sections.push(`Recommendations:\n${recs.map((r) => `  - ${r}`).join("\n")}`)

    return sections.join("\n\n")
  },
})
