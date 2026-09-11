import type { Plugin } from "@opencode-ai/plugin"
import { ensureMemoryDir, migrateFromOldLocation } from "./storage.js"
import {
  memory_read,
  memory_write,
  memory_forget,
  memory_list,
  memory_search,
  memory_search_all,
  memory_projects,
  memory_prune,
  memory_export,
  memory_import,
  memory_compact,
} from "./tools/index.js"
import { sessionCreated, sessionCompacting } from "./hooks/index.js"

export const memory: Plugin = async (ctx) => {
  migrateFromOldLocation()
  ensureMemoryDir(ctx.directory, "global")
  ensureMemoryDir(ctx.directory, "project")

  return {
    tool: {
      memory_read,
      memory_write,
      memory_forget,
      memory_list,
      memory_search,
      memory_search_all,
      memory_projects,
      memory_prune,
      memory_export,
      memory_import,
      memory_compact,
    },

    "session.created": () => sessionCreated(ctx.directory),

    "experimental.session.compacting": (_input, output) =>
      sessionCompacting(ctx.directory, output),
  }
}

export default memory
