import { tool } from "@opencode-ai/plugin"
import { createHash } from "crypto"
import { existsSync, unlinkSync } from "fs"
import { join, resolve } from "path"
import { execSync } from "child_process"
import { homedir } from "os"

const VALID_FILENAME = /^[a-zA-Z0-9._-]+\.md$/

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
    "Delete a memory file. Use this when a user explicitly asks to forget something, " +
    "or when a stored fact is known to be obsolete. " +
    "Cannot delete MEMORY.md — use memory_write to overwrite it instead.",
  args: {
    filename: tool.schema.string().describe("Name of the memory file to delete (e.g. 'old_decisions.md')"),
    scope: tool.schema.enum(["project", "global"]).default("project").describe("'project' (default) or 'global'"),
  },
  async execute(args, ctx) {
    if (!VALID_FILENAME.test(args.filename)) {
      return `Invalid filename: '${args.filename}'. Must match [a-zA-Z0-9._-]+.md`
    }
    if (args.filename === "MEMORY.md") {
      return "Cannot delete MEMORY.md. Use memory_write to overwrite it with updated content instead."
    }
    const filePath = join(memDir(ctx.directory, args.scope), args.filename)
    if (!existsSync(filePath)) {
      return `File '${args.filename}' does not exist in ${args.scope} memory.`
    }
    unlinkSync(filePath)
    return `Deleted '${args.filename}' from ${args.scope} memory.`
  },
})
