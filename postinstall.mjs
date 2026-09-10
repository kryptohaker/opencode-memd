// Automatically copies tool files to ~/.config/opencode/tools/
// Runs after `bun install` so npm-based plugin installs get tools too.

import { existsSync, mkdirSync, copyFileSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { homedir } from "os"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const toolsSrc = join(__dirname, "tools")

// Only run if we have tools to copy
if (!existsSync(toolsSrc)) process.exit(0)

const configDir = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
const toolsDest = join(configDir, "opencode", "tools")

mkdirSync(toolsDest, { recursive: true })

const files = readdirSync(toolsSrc).filter(f => f.endsWith(".ts"))
for (const file of files) {
  copyFileSync(join(toolsSrc, file), join(toolsDest, file))
}

if (files.length > 0) {
  console.log(`opencode-memd: installed ${files.length} tools → ${toolsDest}`)
}
