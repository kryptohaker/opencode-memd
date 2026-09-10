#!/usr/bin/env bash
# opencode-memd installer
# Copies plugin + tools to the correct OpenCode directories.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"

PLUGIN_DIR="$CONFIG_DIR/plugins/opencode-memd"
TOOLS_DIR="$CONFIG_DIR/tools"

echo "Installing opencode-memd..."
echo "  Config dir: $CONFIG_DIR"

# 1. Plugin (session hooks)
mkdir -p "$PLUGIN_DIR"
cp "$SCRIPT_DIR/src/index.ts" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/src/storage.ts" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/package.json" "$PLUGIN_DIR/"
echo "  ✓ Plugin → $PLUGIN_DIR"

# 2. Tools (LLM-callable)
mkdir -p "$TOOLS_DIR"
cp "$SCRIPT_DIR/tools/"*.ts "$TOOLS_DIR/"
echo "  ✓ Tools  → $TOOLS_DIR"

echo ""
echo "Done! Restart OpenCode to load the memory plugin."
echo ""
echo "Tools installed:"
for f in "$SCRIPT_DIR/tools/"*.ts; do
  echo "  - $(basename "$f" .ts)"
done
