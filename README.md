# LeetPush

A privacy-first Chrome extension that automatically pushes your accepted LeetCode solutions to GitHub.

## Overview

LeetPush detects accepted LeetCode submissions in Chrome and sends the solution to a local native helper.

The native helper saves the solution into a local Git repository and pushes it to GitHub using your existing Git and SSH configuration.

    LeetCode
       ↓
    LeetPush Chrome extension
       ↓
    Chrome Native Messaging
       ↓
    Local Python native host
       ↓
    Local Git repository
       ↓
    Git + SSH
       ↓
    GitHub

## Privacy and Security

LeetPush is designed to keep the synchronization process local.

- No GitHub OAuth
- No GitHub Personal Access Token stored in the extension
- No third-party backend
- No browsing-history permission
- No access to all websites
- Only `https://leetcode.com/*` is used as the extension host permission
- GitHub authentication is handled by your local Git/SSH configuration
- The native host accepts messages only from the configured Chrome extension ID
- Problem slugs and problem numbers are validated before creating files
- Only supported programming languages are mapped to file extensions
- Git commands are executed without a shell
- Only the generated solution file is staged by the native host

## Requirements

- Google Chrome
- Python 3
- Git
- A GitHub account
- SSH authentication configured for GitHub
- A GitHub repository for storing LeetCode solutions

The current installers support:

- macOS
- Linux

Windows support is planned for a later release.

## Repository Setup

Create or use a GitHub repository for your LeetCode solutions.

The repository must be accessible using a GitHub SSH URL in this format:

    git@github.com:username/repository.git

Example:

    git@github.com:hrishu802/leetcode-solutions.git

Make sure SSH authentication works before installing LeetPush:

    ssh -T git@github.com

## Chrome Extension Setup

For development and testing, LeetPush can be loaded as an unpacked Chrome extension.

1. Open Chrome.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Select the LeetPush `extension` directory.
6. Copy the extension ID shown by Chrome.

The extension ID is required by the native host installer.

## macOS Installation

From the LeetPush project directory:

    cd ~/Developer/LeetPush
    chmod +x native-host/install-macos.sh

Run the installer with your Chrome extension ID and GitHub repository SSH URL:

    ./native-host/install-macos.sh <chrome-extension-id> <repository-url>

Example:

    ./native-host/install-macos.sh abcdefghijklmnopqrstuvwxyzabcdef git@github.com:username/leetcode-solutions.git

The installer:

1. Validates the Chrome extension ID.
2. Validates the GitHub SSH repository URL.
3. Clones the repository if it is not already present.
4. Verifies the existing repository's `origin` if the repository already exists.
5. Creates the local LeetPush configuration.
6. Installs the Chrome Native Messaging manifest.

The repository is stored under:

    ~/Developer/LeetPushRepositories/

The native messaging manifest is installed under:

    ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/

## Linux Installation

From the LeetPush project directory:

    cd ~/Developer/LeetPush
    chmod +x native-host/install-linux.sh

Run:

    ./native-host/install-linux.sh <chrome-extension-id> <repository-url>

Example:

    ./native-host/install-linux.sh abcdefghijklmnopqrstuvwxyzabcdef git@github.com:username/leetcode-solutions.git

The repository is stored under:

    ~/Developer/LeetPushRepositories/

The Chrome Native Messaging manifest is installed under:

    ~/.config/google-chrome/NativeMessagingHosts/

## How Synchronization Works

When you submit a solution on LeetCode:

1. LeetPush detects the submission.
2. The submitted code and problem information are captured.
3. LeetPush waits for the submission result.
4. Only an `Accepted` submission is sent to the native host.
5. The native host validates the submission data.
6. The solution is written to the configured repository.
7. The solution file is staged.
8. A Git commit is created.
9. The commit is pushed to `origin/main`.

Wrong Answer and other non-accepted results are not saved.

## Solution File Structure

Solutions are stored in the repository's `solutions` directory.

The filename format is:

    <number>-<problem-slug>.<extension>

Examples:

    solutions/1-two-sum.py
    solutions/9-palindrome-number.py
    solutions/835-image-overlap.py

Supported languages currently include:

| Language | Extension |
|---|---|
| Python | `.py` |
| Python3 | `.py` |
| JavaScript | `.js` |
| TypeScript | `.ts` |
| Java | `.java` |
| C++ | `.cpp` |
| C | `.c` |
| C# | `.cs` |
| Go | `.go` |
| Rust | `.rs` |
| Kotlin | `.kt` |
| Swift | `.swift` |

## Git Safety

LeetPush stages only the generated solution file.

Unrelated modified or untracked files in the repository are not intentionally added to the LeetPush commit.

If the solution does not introduce a Git change, no new commit is created.

## Configuration

The native host stores its local configuration in:

    native-host/config.json

This file contains the local repository path and repository URL.

It is intentionally ignored by Git because the repository path is specific to the local machine.

Do not commit local configuration or credentials to the LeetPush repository.

## Troubleshooting

### Native host cannot be contacted

Check that:

- The Chrome extension is loaded.
- The extension ID used during installation is correct.
- The native messaging manifest exists.
- The native host script is executable.
- Python 3 is available.

### Git push fails

Check GitHub SSH authentication:

    ssh -T git@github.com

Then check the solution repository:

    git -C ~/Developer/LeetPushRepositories/<repository-name> remote -v

The `origin` URL should match the repository configured during installation.

### Repository already exists

The installer verifies the existing repository's `origin`.

If the existing repository points to a different URL, installation stops instead of silently changing the remote.

## Development Checks

Before committing changes to LeetPush, run:

    node --check extension/background.js
    node --check extension/content.js
    python3 -m py_compile native-host/leetpush_host.py
    bash -n native-host/install-macos.sh
    bash -n native-host/install-linux.sh
    git diff --check

## Current Status

LeetPush currently supports:

- Chrome extension-based accepted-submission detection
- Chrome Native Messaging
- Local Python native host
- Git-based solution storage
- GitHub SSH push
- macOS installation
- Linux installation
- Extension ID allowlisting
- Input validation and Git safety checks

Windows support and the first packaged release are not part of the current implementation yet.

## License

LeetPush is released under the MIT License.
