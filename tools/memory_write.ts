import { tool } from "@opencode-ai/plugin"
import { createHash } from "crypto"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, resolve } from "path"
import { execSync } from "child_process"
import { homedir } from "os"

const VALID_FILENAME = /^[a-zA-Z0-9._-]+\.md$/
const MAX_INDEX_LINES = 200
const MAX_INDEX_BYTES = 25 * 1024

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

function checkIndex(directory: string, scope: string): string | null {
  const indexPath = join(memDir(directory, scope), "MEMORY.md")
  if (!existsSync(indexPath)) return null
  const content = readFileSync(indexPath, "utf-8")
  const lines = content.split("\n").length
  const bytes = Buffer.byteLength(content, "utf-8")
  if (lines > MAX_INDEX_LINES) return `MEMORY.md has ${lines} lines (limit: ${MAX_INDEX_LINES}). Rewrite: keep one line per entry, move detail into topic files.`
  if (lines > MAX_INDEX_LINES * 0.85) return `MEMORY.md is at ${lines}/${MAX_INDEX_LINES} lines. Consider moving detail into topic files.`
  if (bytes > MAX_INDEX_BYTES) return `MEMORY.md is ${Math.round(bytes / 1024)}KB (limit: 25KB). Shorten entries or split into topic files.`
  return null
}

export default tool({
  description:
    "Write or update a memory file. Saves durable knowledge across sessions. " +
    "For MEMORY.md: keep under 200 lines, one line per entry, move detail into topic files. " +
    "For topic files: use descriptive filenames like 'project_decisions.md'. " +
    "Use scope='global' for user preferences/corrections, scope='project' (default) for project-specific facts. " +
    "Pass mode='overwrite' to replace the file, mode='append' to add at the end.",
  args: {
    filename: tool.schema.string().describe("Name of the memory file (e.g. 'MEMORY.md', 'preferences.md')"),
    content: tool.schema.string().describe("Content to write or append"),
    mode: tool.schema.enum(["overwrite", "append"]).default("overwrite").describe("'overwrite' replaces the file, 'append' adds to the end"),
    scope: tool.schema.enum(["project", "global"]).default("project").describe("'project' (default) or 'global'"),
  },
  async execute(args, ctx) {
    if (!VALID_FILENAME.test(args.filename)) {
      return `Invalid filename: '${args.filename}'. Must match [a-zA-Z0-9._-]+.md`
    }
    const dir = memDir(ctx.directory, args.scope)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const filePath = join(dir, args.filename)

    if (args.mode === "append") {
      const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : ""
      const sep = existing && !existing.endsWith("\n") ? "\n" : ""
      writeFileSync(filePath, existing + sep + args.content, "utf-8")
    } else {
      writeFileSync(filePath, args.content, "utf-8")
    }

    let warning = ""
    if (args.filename === "MEMORY.md") {
      const w = checkIndex(ctx.directory, args.scope)
      if (w) warning = "\n\n⚠️ " + w
    }
    return `Saved to ${args.filename} (${args.scope}, ${args.mode}).${warning}`
  },
})
