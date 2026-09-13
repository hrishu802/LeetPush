#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_PATH="$SCRIPT_DIR/leetpush_host.py"
TEMPLATE_PATH="$SCRIPT_DIR/com.leetpush.host.json.template"

CHROME_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_MANIFEST_PATH="$CHROME_HOST_DIR/com.leetpush.host.json"

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <chrome-extension-id>"
    exit 1
fi

EXTENSION_ID="$1"

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

mkdir -p "$CHROME_HOST_DIR"

sed \
    -e "s#__HOST_PATH__#$HOST_PATH#g" \
    -e "s#__EXTENSION_ID__#$EXTENSION_ID#g" \
    "$TEMPLATE_PATH" > "$HOST_MANIFEST_PATH"

python3 -m json.tool "$HOST_MANIFEST_PATH" > /dev/null

echo "LeetPush native host installed successfully."
echo "Manifest: $HOST_MANIFEST_PATH"
echo "Extension: chrome-extension://$EXTENSION_ID/"
