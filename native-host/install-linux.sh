#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_PATH="$SCRIPT_DIR/leetpush_host.py"
TEMPLATE_PATH="$SCRIPT_DIR/com.leetpush.host.json.template"

CHROME_HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
HOST_MANIFEST_PATH="$CHROME_HOST_DIR/com.leetpush.host.json"

CONFIG_PATH="$SCRIPT_DIR/config.json"

REPOSITORIES_DIR="$HOME/Developer/LeetPushRepositories"

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <chrome-extension-id> <repository-url>"
    exit 1
fi

EXTENSION_ID="$1"
REPO_URL="$2"

if [[ ${#EXTENSION_ID} -ne 32 || ! "$EXTENSION_ID" =~ ^[a-p]+$ ]]; then
    echo "Error: invalid Chrome extension ID."
    exit 1
fi

if [[ ! "$REPO_URL" =~ ^git@github\.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$ ]]; then
    echo "Error: repository URL must be a GitHub SSH URL:"
    echo "       git@github.com:username/repository.git"
    exit 1
fi

REPO_NAME="$(basename "$REPO_URL" .git)"

if [ -z "$REPO_NAME" ] || [ "$REPO_NAME" = "." ] || [ "$REPO_NAME" = "/" ]; then
    echo "Error: could not determine repository name from URL."
    echo "$REPO_URL"
    exit 1
fi

REPO_DIR="$REPOSITORIES_DIR/$REPO_NAME"

mkdir -p "$REPOSITORIES_DIR"

if [ -d "$REPO_DIR/.git" ]; then
    echo "Existing Git repository found:"
    echo "$REPO_DIR"

    EXISTING_REMOTE="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"

    if [ "$EXISTING_REMOTE" != "$REPO_URL" ]; then
        echo "Error: existing repository has a different origin:"
        echo "$EXISTING_REMOTE"
        echo "Expected:"
        echo "$REPO_URL"
        exit 1
    fi

    echo "Repository origin verified."

elif [ -e "$REPO_DIR" ]; then
    echo "Error: target repository path already exists but is not a Git repository:"
    echo "$REPO_DIR"
    exit 1

else
    echo "Cloning repository:"
    echo "$REPO_URL"
    echo "Into:"
    echo "$REPO_DIR"

    git clone "$REPO_URL" "$REPO_DIR"
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

python3 -c 'import json, sys; print(json.dumps({"repo_url": sys.argv[1], "repo_dir": sys.argv[2]}, indent=2))' \
    "$REPO_URL" "$REPO_DIR" > "$CONFIG_PATH"

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