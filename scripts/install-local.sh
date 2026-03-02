#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if command -v brew >/dev/null 2>&1; then
      echo "Error: Bun is not installed."
      echo "Recommended on macOS: install with Homebrew:"
      echo "  brew install bun"
    else
      echo "Error: Bun is not installed."
      echo "Recommended on macOS: install Homebrew, then run:"
      echo "  brew install bun"
      echo "Homebrew: https://brew.sh"
    fi
  else
    echo "Error: Bun is not installed. Install Bun first: https://bun.sh"
  fi
  exit 1
fi

cd "$ROOT_DIR"

echo "Installing dependencies..."
bun install

echo "Linking tiresias-cli globally with Bun..."
bun link

BUN_BIN="${HOME}/.bun/bin"
if [[ ":${PATH}:" != *":${BUN_BIN}:"* ]]; then
  echo
  echo "Add Bun bin to your PATH to use 'tiresias' directly:"
  echo "  export PATH=\"\$HOME/.bun/bin:\$PATH\""
  echo
  echo "Then reload your shell:"
  echo "  source ~/.zshrc"
fi

echo
echo "Installed. Try:"
echo "  tiresias --help"
