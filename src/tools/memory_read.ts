import { tool } from "@opencode-ai/plugin"
import { VALID_FILENAME, readMemoryFile } from "../storage.js"

export const memory_read = tool({
  description:
    "Read a memory file. Pass the filename (e.g. 'project_decisions.md') to read. " +
    "Pass 'MEMORY.md' to read the full index. " +
    "Use scope='global' for user-wide memories, scope='project' (default) for project-specific.",
  args: {
    filename: tool.schema
      .string()
      .describe(
        "Name of the memory file to read (e.g. 'MEMORY.md', 'preferences.md')"
      ),
    scope: tool.schema
      .enum(["project", "global"])
      .default("project")
      .describe("'project' (default) or 'global'"),
  },
  async execute(args, ctx) {
    if (!VALID_FILENAME.test(args.filename)) {
      return `Invalid filename: '${args.filename}'. Must match [a-zA-Z0-9._-]+.md`
    }
    const content = readMemoryFile(ctx.directory, args.filename, args.scope)
    if (content === null) {
      return `File '${args.filename}' does not exist in ${args.scope} memory.`
    }
    return content
  },
})
