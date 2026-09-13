#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_PATH="$SCRIPT_DIR/leetpush_host.py"
TEMPLATE_PATH="$SCRIPT_DIR/com.leetpush.host.json.template"

CHROME_HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
HOST_MANIFEST_PATH="$CHROME_HOST_DIR/com.leetpush.host.json"

CONFIG_PATH="$SCRIPT_DIR/config.json"

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <chrome-extension-id> <repository-path>"
    exit 1
fi

EXTENSION_ID="$1"
REPO_DIR="$2"

if [ ! -d "$REPO_DIR" ]; then
    echo "Error: repository directory does not exist:"
    echo "$REPO_DIR"
    exit 1
fi

if [ ! -d "$REPO_DIR/.git" ]; then
    echo "Error: repository directory is not a Git repository:"
    echo "$REPO_DIR"
    exit 1
fi

if [[ ${#EXTENSION_ID} -ne 32 || ! "$EXTENSION_ID" =~ ^[a-p]+$ ]]; then
    echo "Error: invalid Chrome extension ID."
    exit 1
fi

if [ ! -x "$HOST_PATH" ]; then
    echo "Error: native host is missing or not executable:"
    echo "$HOST_PATH"
    exit 1
fi

if [ ! -f "$TEMPLATE_PATH" ]; then
    echo "Error: manifest template not found:"
    echo "$TEMPLATE_PATH"
    exit 1
fi

REPO_DIR="$(cd "$REPO_DIR" && pwd)"

python3 -c 'import json, sys; print(json.dumps({"repo_dir": sys.argv[1]}, indent=2))' \
    "$REPO_DIR" > "$CONFIG_PATH"

python3 -m json.tool "$CONFIG_PATH" > /dev/null

mkdir -p "$CHROME_HOST_DIR"

sed \
    -e "s#__HOST_PATH__#$HOST_PATH#g" \
    -e "s#__EXTENSION_ID__#$EXTENSION_ID#g" \
    "$TEMPLATE_PATH" > "$HOST_MANIFEST_PATH"

python3 -m json.tool "$HOST_MANIFEST_PATH" > /dev/null

echo "LeetPush native host installed successfully."
echo "Manifest: $HOST_MANIFEST_PATH"
echo "Extension: chrome-extension://$EXTENSION_ID/"
echo "Repository: $REPO_DIR"
echo "Configuration: $CONFIG_PATH"