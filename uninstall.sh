#!/usr/bin/env bash
# opencode-memd uninstaller
# Cleans up standalone tool files and plugin directory from previous versions.
# Memory data is preserved unless you explicitly choose to remove it.

set -e

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-memd"
OLD_MEMORY_DIR="$CONFIG_DIR/memory"

TOOLS_DIR="$CONFIG_DIR/tools"
PLUGIN_DIR="$CONFIG_DIR/plugins/opencode-memd"

echo "opencode-memd uninstaller"
echo "========================"
echo ""

# 1. Remove standalone tool files (v0.2 and earlier)
REMOVED_TOOLS=0
for tool_file in memory_read memory_write memory_list memory_search memory_search_all memory_forget; do
  if [ -f "$TOOLS_DIR/${tool_file}.ts" ]; then
    rm "$TOOLS_DIR/${tool_file}.ts"
    REMOVED_TOOLS=$((REMOVED_TOOLS + 1))
  fi
done

if [ "$REMOVED_TOOLS" -gt 0 ]; then
  echo "  ✓ Removed $REMOVED_TOOLS standalone tool files from $TOOLS_DIR"
else
  echo "  - No standalone tool files found in $TOOLS_DIR"
fi

# 2. Remove old plugin directory (git-clone installs)
if [ -d "$PLUGIN_DIR" ]; then
  rm -rf "$PLUGIN_DIR"
  echo "  ✓ Removed plugin directory: $PLUGIN_DIR"
else
  echo "  - No plugin directory at $PLUGIN_DIR"
fi

# 3. Check for plugin entry in config
CONFIG_FILE="$CONFIG_DIR/opencode.jsonc"
if [ ! -f "$CONFIG_FILE" ]; then
  CONFIG_FILE="$CONFIG_DIR/config.json"
fi

if [ -f "$CONFIG_FILE" ] && grep -q "opencode-memd" "$CONFIG_FILE" 2>/dev/null; then
  echo ""
  echo "  ⚠  Remove 'opencode-memd' from your plugin list in:"
  echo "     $CONFIG_FILE"
fi

# 4. npm/bun uninstall reminder
echo ""
echo "If installed via npm/bun, also run:"
echo "  bun remove opencode-memd"
echo "  # or: npm uninstall opencode-memd"

# 5. Memory data
echo ""
echo "Memory data locations:"
if [ -d "$DATA_DIR" ]; then
  FILE_COUNT=$(find "$DATA_DIR" -name "*.md" 2>/dev/null | wc -l)
  echo "  - $DATA_DIR ($FILE_COUNT .md files)"
fi
if [ -d "$OLD_MEMORY_DIR" ]; then
  FILE_COUNT=$(find "$OLD_MEMORY_DIR" -name "*.md" 2>/dev/null | wc -l)
  echo "  - $OLD_MEMORY_DIR ($FILE_COUNT .md files, old location)"
fi

if [ -d "$DATA_DIR" ] || [ -d "$OLD_MEMORY_DIR" ]; then
  echo ""
  read -p "Delete ALL memory data? This cannot be undone. [y/N] " -r
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    [ -d "$DATA_DIR" ] && rm -rf "$DATA_DIR" && echo "  ✓ Removed $DATA_DIR"
    [ -d "$OLD_MEMORY_DIR" ] && rm -rf "$OLD_MEMORY_DIR" && echo "  ✓ Removed $OLD_MEMORY_DIR"
  else
    echo "  - Memory data preserved."
  fi
fi

echo ""
echo "Done. Restart OpenCode to complete uninstallation."
