import { tool } from "@opencode-ai/plugin"
import { createHash } from "crypto"
import { existsSync, readFileSync, readdirSync } from "fs"
import { join, resolve } from "path"
import { execSync } from "child_process"
import { homedir } from "os"

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
    "List all memory files with their sizes and first-line previews. " +
    "Use scope='global' to list user-wide memories, scope='project' (default) for project-specific. " +
    "Use this to see what knowledge is stored before reading specific files.",
  args: {
    scope: tool.schema.enum(["project", "global"]).default("project").describe("'project' (default) or 'global'"),
  },
  async execute(args, ctx) {
    const dir = memDir(ctx.directory, args.scope)
    if (!existsSync(dir)) return `No ${args.scope} memory files yet. Use memory_write to save knowledge.`

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((name) => {
        const content = readFileSync(join(dir, name), "utf-8")
        const lines = content.split("\n").filter((l) => l.trim())
        const preview = lines[0]?.slice(0, 100) || "(empty)"
        return { name, size: Buffer.byteLength(content, "utf-8"), preview }
      })

    if (files.length === 0) return `No ${args.scope} memory files yet. Use memory_write to save knowledge.`

    const lines = files.map((f) => `- ${f.name} (${f.size} bytes): ${f.preview}`)
    return `${args.scope} memory files (${files.length}):\n${lines.join("\n")}`
  },
})
