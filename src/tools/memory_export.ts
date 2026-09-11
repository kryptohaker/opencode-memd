import { tool } from "@opencode-ai/plugin"
import {
  getMemoryDir,
  getMemoryBaseDir,
  getGlobalDir,
} from "../storage.js"
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "fs"
import { join } from "path"

function collectFiles(dir: string, label: string): Array<{ path: string; content: string }> {
  if (!existsSync(dir)) return []
  const files: Array<{ path: string; content: string }> = []
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    files.push({
      path: `${label}/${name}`,
      content: readFileSync(join(dir, name), "utf-8"),
    })
  }
  return files
}

export const memory_export = tool({
  description:
    "Export memory files to a single JSON file for backup or transfer. " +
    "Use scope='project' to export current project memory, 'global' for global memory, " +
    "or 'all' to export everything (global + current project). " +
    "The export file is written to the specified output path.",
  args: {
    scope: tool.schema
      .enum(["project", "global", "all"])
      .default("all")
      .describe("'project', 'global', or 'all' (default)"),
    output: tool.schema
      .string()
      .describe("Output file path (e.g. 'memory-backup.json')"),
  },
  async execute(args, ctx) {
    const files: Array<{ path: string; content: string }> = []

    if (args.scope === "global" || args.scope === "all") {
      files.push(...collectFiles(getGlobalDir(), "global"))
    }
    if (args.scope === "project" || args.scope === "all") {
      const projectDir = getMemoryDir(ctx.directory, "project")
      files.push(...collectFiles(projectDir, "project"))
    }

    if (files.length === 0) {
      return `No memory files to export in scope '${args.scope}'.`
    }

    const exportData = {
      version: "0.3.0",
      exportedAt: new Date().toISOString(),
      scope: args.scope,
      fileCount: files.length,
      files,
    }

    const outputPath = args.output.startsWith("/")
      ? args.output
      : join(ctx.directory, args.output)

    writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8")
    return `Exported ${files.length} memory file(s) to ${outputPath}`
  },
})
