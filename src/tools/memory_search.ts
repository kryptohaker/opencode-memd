import { tool } from "@opencode-ai/plugin"
import { searchMemory } from "../storage.js"

export const memory_search = tool({
  description:
    "Search current project's or global memory files for a pattern (case-insensitive regex). " +
    "Returns matching lines with file names and line numbers. " +
    "Fuzzy matching is enabled by default for typo tolerance and word variants. " +
    "Use scope='global' to search user-wide memories, scope='project' (default) for project-specific.",
  args: {
    pattern: tool.schema
      .string()
      .describe("Search pattern (case-insensitive regex)"),
    scope: tool.schema
      .enum(["project", "global"])
      .default("project")
      .describe("'project' (default) or 'global'"),
    fuzzy: tool.schema
      .boolean()
      .default(true)
      .optional()
      .describe("Enable fuzzy matching for typo tolerance and word variants (default: true)"),
  },
  async execute(args, ctx) {
    const results = searchMemory(ctx.directory, args.pattern, args.scope, args.fuzzy)
    if (results.length === 0) {
      return `No matches for '${args.pattern}' in ${args.scope} memory.`
    }

    const lines = results.map((r) => `${r.file}:${r.line}: ${r.text}`)
    let output = `Found ${results.length} match(es) in ${args.scope} memory:\n${lines.join("\n")}`
    if (results.length >= 50) {
      output += `\n\n(Showing first 50 results. Refine your query to narrow.)`
    }
    return output
  },
})
