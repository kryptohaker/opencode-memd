import { tool } from "@opencode-ai/plugin"
import { searchAllMemory } from "../storage.js"

export const memory_search_all = tool({
  description:
    "Search across ALL projects' and global memory files for a pattern (case-insensitive regex). " +
    "Use this when the user asks about something that might be in a different project's memory or in global preferences. " +
    "Fuzzy matching is enabled by default for typo tolerance and word variants. " +
    "Returns matching lines with source (global/project), file, and line number.",
  args: {
    pattern: tool.schema
      .string()
      .describe("Search pattern (case-insensitive regex)"),
    fuzzy: tool.schema
      .boolean()
      .default(true)
      .optional()
      .describe("Enable fuzzy matching for typo tolerance and word variants (default: true)"),
  },
  async execute(args) {
    const results = searchAllMemory(args.pattern, args.fuzzy)
    if (results.length === 0) {
      return `No matches for '${args.pattern}' across any memory.`
    }

    const lines = results.map(
      (r) => `[${r.project}] ${r.file}:${r.line}: ${r.text}`
    )
    let output = `Found ${results.length} match(es) across all memory:\n${lines.join("\n")}`
    if (results.length >= 50) {
      output += `\n\n(Showing first 50 results. Refine your query.)`
    }
    return output
  },
})
