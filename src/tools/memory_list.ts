import { tool } from "@opencode-ai/plugin"
import { listMemoryFiles } from "../storage.js"

export const memory_list = tool({
  description:
    "List all memory files with their sizes, types, tags, and first-line previews. " +
    "Use scope='global' to list user-wide memories, scope='project' (default) for project-specific. " +
    "Pass tag to filter by a specific tag. " +
    "Use this to see what knowledge is stored before reading specific files.",
  args: {
    scope: tool.schema
      .enum(["project", "global"])
      .default("project")
      .describe("'project' (default) or 'global'"),
    tag: tool.schema
      .string()
      .optional()
      .describe("Filter by tag (e.g. 'testing'). Only files with this tag are returned."),
  },
  async execute(args, ctx) {
    const files = listMemoryFiles(ctx.directory, args.scope, args.tag)
    if (files.length === 0) {
      const tagNote = args.tag ? ` with tag '${args.tag}'` : ""
      return `No ${args.scope} memory files${tagNote}. Use memory_write to save knowledge.`
    }

    const lines = files.map((f) => {
      const typeTag = f.type ? ` [${f.type}]` : ""
      const tagsStr = f.tags.length > 0 ? ` {${f.tags.join(", ")}}` : ""
      return `- ${f.name}${typeTag}${tagsStr} (${f.size} bytes): ${f.preview}`
    })
    const tagNote = args.tag ? ` (filtered by tag: ${args.tag})` : ""
    return `${args.scope} memory files (${files.length})${tagNote}:\n${lines.join("\n")}`
  },
})
