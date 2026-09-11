import { tool } from "@opencode-ai/plugin"
import { listProjects } from "../storage.js"

export const memory_projects = tool({
  description:
    "List all projects that have stored memory, with their paths, file counts, and total sizes. " +
    "Use this to see what projects have accumulated memory, or to find a specific project's memory.",
  args: {},
  async execute() {
    const projects = listProjects()
    if (projects.length === 0) {
      return "No project memory directories found."
    }

    const lines = projects.map(
      (p) =>
        `- ${p.path} (${p.fileCount} files, ${Math.round(p.totalSize / 1024) || "<1"}KB)`
    )
    return `Projects with memory (${projects.length}):\n${lines.join("\n")}`
  },
})
