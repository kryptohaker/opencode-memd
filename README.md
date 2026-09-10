# opencode-memd

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Half vibe-coded persistent memory for [OpenCode](https://opencode.ai/).

Plain markdown, no vector DB, no embeddings — just an index file and topic files that the LLM reads and writes.

## How it works

```
LLM
 ↓
small MEMORY.md injected into context
 ↓
search/read markdown only when needed
 ↓
persistent memory across sessions & projects
```

1. **Session start** — global + project `MEMORY.md` indexes (≤200 lines each) are injected into context via plugin hook
2. **During session** — LLM uses memory tools to recall and save knowledge
3. **Across sessions** — all sessions in the same git repo share one memory directory, so knowledge accumulates
4. **Across projects** — global memory (preferences, corrections) is shared everywhere

Memory is stored outside your project at `~/.config/opencode/memory/` so it doesn't pollute your repo.

## Install

### npm / bun (recommended)

```bash
bun add opencode-memd
bun pm trust opencode-memd
```

Then add to your OpenCode config (`~/.config/opencode/config.json` or project `opencode.json`):

```json
{
  "plugins": ["opencode-memd"]
}
```

The `postinstall` hook copies memory tools to `~/.config/opencode/tools/` automatically. Bun blocks postinstall scripts by default — `bun pm trust` allows it to run.

### Git clone

```bash
git clone https://github.com/kryptohaker/opencode-memd.git
cd opencode-memd
./install.sh
```

### Manual

```bash
# 1. Plugin — handles context injection
cp -r opencode-memd ~/.config/opencode/plugins/opencode-memd

# 2. Tools — copy into OpenCode's tools directory
cp opencode-memd/tools/*.ts ~/.config/opencode/tools/
```

## Memory scopes

| Scope | Directory | What goes here |
|-------|-----------|----------------|
| `global` | `~/.config/opencode/memory/global/` | User preferences, workflow, repeated corrections |
| `project` | `~/.config/opencode/memory/projects/<hash>-<path>/` | Decisions, conventions, references for one project |

## Memory tools

| Tool | Description |
|------|-------------|
| `memory_read` | Read a memory file from global or project scope |
| `memory_write` | Create/replace or append to a memory file |
| `memory_list` | List all memory files with size and first-line preview |
| `memory_search` | Search current scope's memory for a regex pattern |
| `memory_search_all` | Search across global + all projects' memory |
| `memory_forget` | Delete an obsolete memory file |

All tools except `memory_search_all` accept a `scope` parameter: `"project"` (default) or `"global"`.

### Examples

```
> What testing framework does this project use?
# LLM calls: memory_search [pattern=testing|test framework, scope=project]

> Save that I prefer pnpm over npm
# LLM calls: memory_write [filename=preferences.md, scope=global, mode=append]

> What do you know about me across all projects?
# LLM calls: memory_search_all [pattern=prefer|workflow|style]

> Forget the old deployment notes
# LLM calls: memory_forget [filename=deployment_notes.md, scope=project]
```

## Storage layout

```
~/.config/opencode/memory/
├── global/                        # Shared across all projects
│   ├── MEMORY.md                  # Global index (loaded every session)
│   ├── preferences.md             # User preferences
│   └── workflow.md                # Workflow notes
└── projects/
    ├── a1b2c3d4-home-user-projects-myapp/
    │   ├── MEMORY.md              # Project index (loaded every session)
    │   ├── decisions.md           # Architecture decisions
    │   └── corrections.md         # Things the user corrected
    └── f9e8d7c6-home-user-projects-other/
        └── MEMORY.md
```

## What gets remembered

The LLM decides. It's guided to save:

- Your corrections and confirmed approaches → **global**
- Your preferences and working style → **global**
- Project decisions and constraints → **project**
- External references (trackers, dashboards) → **project**

It skips anything derivable from the codebase (architecture, file paths, dependencies).

## Project structure

```
opencode-memd/
├── src/
│   ├── index.ts           # Plugin entry — session hooks (context injection)
│   └── storage.ts         # Shared storage layer (validation, paths, I/O)
├── tools/
│   ├── memory_read.ts     # Tool: read a memory file
│   ├── memory_write.ts    # Tool: write/append to a memory file
│   ├── memory_list.ts     # Tool: list all memory files
│   ├── memory_search.ts   # Tool: search current scope
│   ├── memory_search_all.ts  # Tool: search all projects + global
│   └── memory_forget.ts   # Tool: delete a memory file
├── install.sh             # One-command installer
├── postinstall.mjs        # Auto-copies tools on npm install
├── package.json
└── tsconfig.json
```

## Configuration

No configuration needed. The plugin uses sensible defaults:

| Setting | Default |
|---------|---------|
| Memory directory | `~/.config/opencode/memory/` (respects `$XDG_CONFIG_HOME`) |
| Index limit | 200 lines / 25KB per MEMORY.md |
| Search limit | 50 results max |
| Project key | SHA-256 prefix + path slug (e.g. `a1b2c3d4-home-user-myapp`) |

## Design philosophy

This plugin is intentionally simple. It does not use embeddings, vector databases, semantic search, or automatic memory curation. The LLM handles all the semantic reasoning — the plugin just provides safe, bounded, persistent markdown storage.

## License

MIT — see [LICENSE](LICENSE).

## Author

**Ramil Mustafayev** ([@kryptohaker](https://github.com/kryptohaker))
