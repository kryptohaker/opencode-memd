import { readIndex } from "../storage.js"

export const SYSTEM_CONTEXT = `You have persistent memory across sessions via the memory tools.

Memory has two scopes:
- **global** — shared across ALL projects (your preferences, workflow, corrections)
- **project** — specific to the current project (decisions, conventions, references)

At session start, both MEMORY.md indexes are loaded below. They summarize what you know.

Available memory tools:
- **memory_read** — read a topic file for full detail
- **memory_write** — save or update a memory file (overwrite or append)
- **memory_list** — list all files in a scope with sizes and previews
- **memory_search** — search within one scope (regex + fuzzy matching for typo tolerance)
- **memory_search_all** — search across ALL projects and global memory (with fuzzy matching)
- **memory_forget** — delete an obsolete memory file
- **memory_projects** — list all projects that have stored memory
- **memory_prune** — find stale files and optionally archive them
- **memory_export** — export memory to a JSON file for backup or transfer
- **memory_import** — import memory from a JSON export file
- **memory_compact** — scan for duplicates/overlap, deduplicate lines, or merge files
- **memory_status** — health report: file counts, sizes, index usage, stale/duplicate alerts

Topic files support types and tags via YAML frontmatter:
- **user** — role, preferences, knowledge (e.g. 'preferences.md')
- **feedback** — corrections, confirmed approaches (e.g. 'corrections.md')
- **project** — decisions, conventions, constraints (e.g. 'decisions.md')
- **reference** — external links, trackers, dashboards (e.g. 'references.md')

Tags allow finer categorization beyond types. Use the tags parameter in memory_write or include in frontmatter.

Timestamps (created/updated) are added automatically. To set type and tags, include frontmatter:
\`\`\`
---
type: feedback
tags: testing, ci
---
Your content here
\`\`\`

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

export async function sessionCreated(directory: string) {
  const globalIndex = readIndex(directory, "global")
  const projectIndex = readIndex(directory, "project")

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
}

export async function sessionCompacting(
  directory: string,
  output: { context: string[] }
) {
  const globalIndex = readIndex(directory, "global")
  const projectIndex = readIndex(directory, "project")

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

  output.context.push(
    `\n---\nBefore summarizing this conversation, extract any memorable facts that haven't been saved yet:\n` +
    `- User preferences, corrections, or workflow patterns → save to global scope with memory_write\n` +
    `- Project decisions, conventions, or constraints → save to project scope with memory_write\n` +
    `Only save facts worth remembering across sessions. Skip anything derivable from the codebase.\n---`
  )
}
