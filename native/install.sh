#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_DIR="$HOME/.tab-deduplicator"
BINARY_PATH="$BINARY_DIR/tab-deduplicator-host"
HOST_MANIFEST_NAME="com.tabdeduplicator.windownames.json"
CHROME_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

echo "========================================"
echo " Tab Deduplicator — Native Host Installer"
echo "========================================"
echo ""

# ── 1. Check for Swift ────────────────────────────────────────────
if ! command -v swiftc &>/dev/null; then
    echo "Error: swiftc not found."
    echo "Install Xcode Command Line Tools and try again:"
    echo "  xcode-select --install"
    exit 1
fi

# ── 2. Compile ────────────────────────────────────────────────────
echo "Compiling native host binary..."
mkdir -p "$BINARY_DIR"
swiftc "$SCRIPT_DIR/host.swift" -O -o "$BINARY_PATH"
chmod +x "$BINARY_PATH"
echo "  Binary → $BINARY_PATH"
echo ""

# ── 3. Extension ID ───────────────────────────────────────────────
echo "Next, find your extension ID:"
echo "  1. Open Chrome and go to chrome://extensions"
echo "  2. Enable Developer mode (top-right toggle)"
echo "  3. Find 'Tab Deduplicator' and copy its ID (32 lowercase letters)"
echo ""
read -rp "Paste extension ID: " EXTENSION_ID

if [[ ! "$EXTENSION_ID" =~ ^[a-z]{32}$ ]]; then
    echo ""
    echo "Error: Expected 32 lowercase letters (e.g. abcdefghijklmnopqrstuvwxyzabcdef)."
    echo "Re-run this script and try again."
    exit 1
fi

# ── 4. Write host manifest ────────────────────────────────────────
mkdir -p "$CHROME_HOST_DIR"
cat > "$CHROME_HOST_DIR/$HOST_MANIFEST_NAME" <<JSON
{
  "name": "com.tabdeduplicator.windownames",
  "description": "Reads Chrome window names via AppleScript for Tab Deduplicator",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
JSON
echo "  Host manifest → $CHROME_HOST_DIR/$HOST_MANIFEST_NAME"
echo ""

# ── 5. Done ───────────────────────────────────────────────────────
echo "Done! Reload the Tab Deduplicator extension in Chrome:"
echo "  chrome://extensions → Tab Deduplicator → refresh icon"
echo ""
echo "Window names (including custom names set via Window → Name Window)"
echo "will now appear in the extension popup."
