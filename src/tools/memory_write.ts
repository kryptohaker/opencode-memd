import { tool } from "@opencode-ai/plugin"
import {
  VALID_FILENAME,
  readMemoryFile,
  writeMemoryFile,
  appendMemoryFile,
  checkIndexSize,
  checkTopicSize,
  parseFrontmatter,
  buildFrontmatter,
  formatTags,
} from "../storage.js"

export const memory_write = tool({
  description:
    "Write or update a memory file. Saves durable knowledge across sessions. " +
    "For MEMORY.md: keep under 200 lines, one line per entry, move detail into topic files. " +
    "For topic files: use descriptive filenames like 'project_decisions.md'. " +
    "Topic files automatically get timestamps. You can add a type in YAML frontmatter " +
    "(user/feedback/project/reference) and tags for finer categorization. " +
    "Use scope='global' for user preferences/corrections, scope='project' (default) for project-specific facts. " +
    "Pass mode='overwrite' to replace the file, mode='append' to add at the end.",
  args: {
    filename: tool.schema
      .string()
      .describe(
        "Name of the memory file (e.g. 'MEMORY.md', 'preferences.md')"
      ),
    content: tool.schema.string().describe("Content to write or append"),
    mode: tool.schema
      .enum(["overwrite", "append"])
      .default("overwrite")
      .describe("'overwrite' replaces the file, 'append' adds to the end"),
    scope: tool.schema
      .enum(["project", "global"])
      .default("project")
      .describe("'project' (default) or 'global'"),
    tags: tool.schema
      .string()
      .optional()
      .describe(
        "Comma-separated tags for categorization (e.g. 'tooling, testing'). " +
        "Merged with existing tags on append. Omit to leave tags unchanged."
      ),
  },
  async execute(args, ctx) {
    if (!VALID_FILENAME.test(args.filename)) {
      return `Invalid filename: '${args.filename}'. Must match [a-zA-Z0-9._-]+.md`
    }

    let content = args.content
    if (args.tags && args.filename !== "MEMORY.md") {
      const parsed = parseFrontmatter(content)
      const existingContent = readMemoryFile(ctx.directory, args.filename, args.scope)
      const existingParsed = existingContent ? parseFrontmatter(existingContent) : null

      const newTags = args.tags.split(",").map((t) => t.trim().toLowerCase()).filter((t) => t)
      const existingTags = existingParsed?.metadata?.tags
        ? existingParsed.metadata.tags.split(",").map((t) => t.trim().toLowerCase()).filter((t) => t)
        : []
      const mergedTags = [...new Set([...existingTags, ...newTags])]

      const meta = parsed.metadata || {}
      meta.tags = formatTags(args.mode === "overwrite" ? newTags : mergedTags)
      content = buildFrontmatter(meta) + parsed.body
    }

    if (args.mode === "append") {
      appendMemoryFile(ctx.directory, args.filename, content, args.scope)
    } else {
      writeMemoryFile(ctx.directory, args.filename, content, args.scope)
    }

    let warning = ""
    if (args.filename === "MEMORY.md") {
      const w = checkIndexSize(ctx.directory, args.scope)
      if (w) warning = "\n\n⚠️ " + w
    } else {
      const w = checkTopicSize(ctx.directory, args.filename, args.scope)
      if (w) warning = "\n\n⚠️ " + w
    }
    return `Saved to ${args.filename} (${args.scope}, ${args.mode}).${warning}`
  },
})
