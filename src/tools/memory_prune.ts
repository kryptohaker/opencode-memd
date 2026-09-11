import { tool } from "@opencode-ai/plugin"
import { findStaleFiles, archiveMemoryFile } from "../storage.js"

export const memory_prune = tool({
  description:
    "Find stale memory files that haven't been updated recently and optionally archive them. " +
    "Use action='scan' (default) to list stale files without changing anything. " +
    "Use action='archive' with a filename to move it to .archive/ (recoverable). " +
    "Archived files are removed from active memory but kept on disk for recovery.",
  args: {
    action: tool.schema
      .enum(["scan", "archive"])
      .default("scan")
      .describe("'scan' lists stale files, 'archive' moves a file to .archive/"),
    scope: tool.schema
      .enum(["project", "global"])
      .default("project")
      .describe("'project' (default) or 'global'"),
    days: tool.schema
      .number()
      .default(90)
      .optional()
      .describe("Files not updated in this many days are considered stale (default: 90)"),
    filename: tool.schema
      .string()
      .optional()
      .describe("File to archive (required when action='archive')"),
  },
  async execute(args, ctx) {
    if (args.action === "archive") {
      if (!args.filename) {
        return "Provide a filename to archive."
      }
      const archived = archiveMemoryFile(ctx.directory, args.filename, args.scope)
      if (!archived) {
        return `File '${args.filename}' not found in ${args.scope} memory (or is MEMORY.md).`
      }
      return `Archived '${args.filename}' to .archive/ in ${args.scope} memory. The file is removed from active memory but recoverable from the archive.`
    }

    const staleDays = args.days || 90
    const stale = findStaleFiles(ctx.directory, args.scope, staleDays)
    if (stale.length === 0) {
      return `No stale files in ${args.scope} memory (threshold: ${staleDays} days).`
    }

    const lines = stale.map((f) => {
      const typeTag = f.type ? ` [${f.type}]` : ""
      const tagsStr = f.tags.length > 0 ? ` {${f.tags.join(", ")}}` : ""
      return `- ${f.name}${typeTag}${tagsStr} — ${f.daysStale} days stale (last: ${f.lastUpdated.slice(0, 10)}): ${f.preview}`
    })
    return `Stale files in ${args.scope} memory (>${staleDays} days, ${stale.length} found):\n${lines.join("\n")}\n\nUse action='archive' with a filename to archive, or memory_forget to delete permanently.`
  },
})
