import { tool } from "@opencode-ai/plugin"
import { VALID_FILENAME, deleteMemoryFile } from "../storage.js"

export const memory_forget = tool({
  description:
    "Delete a memory file. Use this when a user explicitly asks to forget something, " +
    "or when a stored fact is known to be obsolete. " +
    "Cannot delete MEMORY.md — use memory_write to overwrite it instead.",
  args: {
    filename: tool.schema
      .string()
      .describe(
        "Name of the memory file to delete (e.g. 'old_decisions.md')"
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
    if (args.filename === "MEMORY.md") {
      return "Cannot delete MEMORY.md. Use memory_write to overwrite it with updated content instead."
    }
    const deleted = deleteMemoryFile(
      ctx.directory,
      args.filename,
      args.scope
    )
    if (!deleted) {
      return `File '${args.filename}' does not exist in ${args.scope} memory.`
    }
    return `Deleted '${args.filename}' from ${args.scope} memory.`
  },
})
