import type { Plugin } from "@opencode-ai/plugin"
import { readIndex, ensureMemoryDir } from "./storage.js"

const SYSTEM_CONTEXT = `You have persistent memory across sessions via the memory tools.

Memory has two scopes:
- **global** — shared across ALL projects (your preferences, workflow, corrections)
- **project** — specific to the current project (decisions, conventions, references)

At session start, both MEMORY.md indexes are loaded below. They summarize what you know.
Use memory_read to get detail from topic files. Use memory_write to save durable knowledge.
Use memory_search_all to find facts across ALL projects.
Use memory_forget to delete obsolete files.

Rules for MEMORY.md:
- Keep it under 200 lines, one line per entry
- Move detailed notes into topic files (e.g. 'project_decisions.md')
- Use descriptive filenames for topic files
- Only save facts worth remembering across sessions
- Skip anything you can derive from the codebase itself

What to save (and where):
- User preferences and workflow → global scope
- Repeated corrections → global scope
- Project decisions and conventions → project scope
- External references (trackers, dashboards) → project scope
- Do NOT save architecture or file paths derivable from code
- Do NOT save secrets, credentials, tokens, or API keys`

export const memory: Plugin = async (ctx) => {
  ensureMemoryDir(ctx.directory, "global")
  ensureMemoryDir(ctx.directory, "project")

  return {
    "session.created": async () => {
      const globalIndex = readIndex(ctx.directory, "global")
      const projectIndex = readIndex(ctx.directory, "project")

      let memorySection = ""
      if (globalIndex) {
        memorySection += `\nGlobal MEMORY.md:\n${globalIndex}\n`
      } else {
        memorySection += `\nGlobal MEMORY.md is empty.\n`
      }
      memorySection += "---\n"
      if (projectIndex) {
        memorySection += `Project MEMORY.md:\n${projectIndex}\n`
      } else {
        memorySection += `Project MEMORY.md is empty.\n`
      }

      return {
        context: `${SYSTEM_CONTEXT}\n\n---${memorySection}---`,
      }
    },

    "experimental.session.compacting": async (_input, output) => {
      const globalIndex = readIndex(ctx.directory, "global")
      const projectIndex = readIndex(ctx.directory, "project")

      let memorySection = ""
      if (globalIndex) {
        memorySection += `\nGlobal MEMORY.md:\n${globalIndex}\n`
      }
      if (projectIndex) {
        memorySection += `Project MEMORY.md:\n${projectIndex}\n`
      }
      if (memorySection) {
        output.context.push(
          `\n---\nPersistent memory:${memorySection}---`
        )
      }
    },
  }
}

export default memory
