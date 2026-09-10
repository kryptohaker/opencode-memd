import { tool } from "@opencode-ai/plugin"
import { existsSync, readFileSync, readdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const MAX_RESULTS = 50

function searchDir(dir: string, regex: RegExp, limit: number): Array<{ file: string; line: number; text: string }> {
  if (!existsSync(dir)) return []
  const results: Array<{ file: string; line: number; text: string }> = []
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const content = readFileSync(join(dir, name), "utf-8")
    for (const [i, text] of content.split("\n").entries()) {
      if (regex.test(text)) {
        results.push({ file: name, line: i + 1, text: text.trim() })
        if (results.length >= limit) return results
      }
    }
  }
  return results
}

export default tool({
  description:
    "Search across ALL projects' and global memory files for a pattern (case-insensitive regex). " +
    "Use this when the user asks about something that might be in a different project's memory or in global preferences. " +
    "Returns matching lines with source (global/project), file, and line number.",
  args: {
    pattern: tool.schema.string().describe("Search pattern (case-insensitive regex)"),
  },
  async execute(args) {
    const baseDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode", "memory")
    if (!existsSync(baseDir)) return `No matches for '${args.pattern}' across any memory.`

    const regex = new RegExp(args.pattern, "i")
    const results: Array<{ project: string; file: string; line: number; text: string }> = []
    let remaining = MAX_RESULTS

    // Search global first
    const globalDir = join(baseDir, "global")
    if (existsSync(globalDir)) {
      for (const r of searchDir(globalDir, regex, remaining)) {
        results.push({ ...r, project: "global" })
      }
      remaining = MAX_RESULTS - results.length
    }

    // Search project directories
    const projectsDir = join(baseDir, "projects")
    if (existsSync(projectsDir) && remaining > 0) {
      for (const projectDir of readdirSync(projectsDir)) {
        if (remaining <= 0) break
        try {
          for (const r of searchDir(join(projectsDir, projectDir), regex, remaining)) {
            results.push({ ...r, project: projectDir })
          }
          remaining = MAX_RESULTS - results.length
        } catch { /* skip non-dirs */ }
      }
    }

    // Also search legacy flat directories (pre-0.2 layout)
    if (remaining > 0) {
      try {
        for (const entry of readdirSync(baseDir)) {
          if (entry === "global" || entry === "projects") continue
          if (remaining <= 0) break
          try {
            for (const r of searchDir(join(baseDir, entry), regex, remaining)) {
              results.push({ ...r, project: `legacy:${entry}` })
            }
            remaining = MAX_RESULTS - results.length
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    if (results.length === 0) return `No matches for '${args.pattern}' across any memory.`

    const lines = results.map((r) => `[${r.project}] ${r.file}:${r.line}: ${r.text}`)
    let output = `Found ${results.length} match(es) across all memory:\n${lines.join("\n")}`
    if (results.length >= MAX_RESULTS) output += `\n\n(Showing first ${MAX_RESULTS} results. Refine your query.)`
    return output
  },
})
