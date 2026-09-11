import { tool } from "@opencode-ai/plugin"
import { ensureMemoryDir, getMemoryDir, getGlobalDir } from "../storage.js"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

type ExportFile = { path: string; content: string }
type ExportData = {
  version: string
  files: ExportFile[]
}

export const memory_import = tool({
  description:
    "Import memory files from a JSON export (created by memory_export). " +
    "Use mode='merge' (default) to keep existing files and only add new ones. " +
    "Use mode='overwrite' to replace existing files with imported ones. " +
    "Files are placed into the correct scope (global/project) based on the export paths.",
  args: {
    input: tool.schema
      .string()
      .describe("Path to the JSON export file (e.g. 'memory-backup.json')"),
    mode: tool.schema
      .enum(["merge", "overwrite"])
      .default("merge")
      .describe("'merge' (default) skips existing files, 'overwrite' replaces them"),
  },
  async execute(args, ctx) {
    const inputPath = args.input.startsWith("/")
      ? args.input
      : join(ctx.directory, args.input)

    if (!existsSync(inputPath)) {
      return `File not found: ${inputPath}`
    }

    let data: ExportData
    try {
      data = JSON.parse(readFileSync(inputPath, "utf-8"))
    } catch {
      return `Failed to parse export file. Ensure it's a valid JSON export from memory_export.`
    }

    if (!data.files || !Array.isArray(data.files)) {
      return `Invalid export format: missing 'files' array.`
    }

    let imported = 0
    let skipped = 0

    for (const file of data.files) {
      const parts = file.path.split("/")
      if (parts.length !== 2) {
        skipped++
        continue
      }

      const [scope, filename] = parts
      let targetDir: string

      if (scope === "global") {
        ensureMemoryDir(ctx.directory, "global")
        targetDir = getGlobalDir()
      } else if (scope === "project") {
        ensureMemoryDir(ctx.directory, "project")
        targetDir = getMemoryDir(ctx.directory, "project")
      } else {
        skipped++
        continue
      }

      const targetPath = join(targetDir, filename)
      if (args.mode === "merge" && existsSync(targetPath)) {
        skipped++
        continue
      }

      writeFileSync(targetPath, file.content, "utf-8")
      imported++
    }

    return `Imported ${imported} file(s), skipped ${skipped}. Mode: ${args.mode}.`
  },
})
