import { tool } from "@opencode-ai/plugin"
import { createHash } from "crypto"
import { existsSync, readFileSync, readdirSync } from "fs"
import { join, resolve } from "path"
import { execSync } from "child_process"
import { homedir } from "os"

const MAX_RESULTS = 50

function getProjectRoot(dir: string): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: dir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch { return resolve(dir) }
}

function memDir(directory: string, scope: string): string {
  const base = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode", "memory")
  if (scope === "global") return join(base, "global")
  const root = getProjectRoot(directory)
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8)
  const slug = root.replace(/\//g, "-").replace(/^-/, "")
  return join(base, "projects", `${hash}-${slug}`)
}

export default tool({
  description:
    "Search current project's or global memory files for a pattern (case-insensitive regex). " +
    "Returns matching lines with file names and line numbers. " +
    "Use scope='global' to search user-wide memories, scope='project' (default) for project-specific.",
  args: {
    pattern: tool.schema.string().describe("Search pattern (case-insensitive regex)"),
    scope: tool.schema.enum(["project", "global"]).default("project").describe("'project' (default) or 'global'"),
  },
  async execute(args, ctx) {
    const dir = memDir(ctx.directory, args.scope)
    if (!existsSync(dir)) return `No matches for '${args.pattern}' in ${args.scope} memory.`

    const regex = new RegExp(args.pattern, "i")
    const results: Array<{ file: string; line: number; text: string }> = []

    for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const content = readFileSync(join(dir, name), "utf-8")
      for (const [i, text] of content.split("\n").entries()) {
        if (regex.test(text)) {
          results.push({ file: name, line: i + 1, text: text.trim() })
          if (results.length >= MAX_RESULTS) break
        }
      }
      if (results.length >= MAX_RESULTS) break
    }

    if (results.length === 0) return `No matches for '${args.pattern}' in ${args.scope} memory.`

    const lines = results.map((r) => `${r.file}:${r.line}: ${r.text}`)
    let output = `Found ${results.length} match(es) in ${args.scope} memory:\n${lines.join("\n")}`
    if (results.length >= MAX_RESULTS) output += `\n\n(Showing first ${MAX_RESULTS} results. Refine your query to narrow.)`
    return output
  },
})
