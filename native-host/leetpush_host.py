#!/usr/bin/env python3

import json
import re
import struct
import subprocess
import sys
from pathlib import Path


CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def load_repo_dir():
    if not CONFIG_PATH.is_file():
        raise RuntimeError(
            f"LeetPush configuration file not found: {CONFIG_PATH}"
        )

    try:
        config = json.loads(
            CONFIG_PATH.read_text(encoding="utf-8")
        )
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"Invalid LeetPush configuration: {error}"
        ) from error

    repo_dir = config.get("repo_dir")

    if not isinstance(repo_dir, str) or not repo_dir.strip():
        raise RuntimeError(
            "LeetPush configuration is missing 'repo_dir'."
        )

    repo_dir = Path(repo_dir).expanduser().resolve()

    if not repo_dir.is_dir():
        raise RuntimeError(
            f"Configured repository directory does not exist: {repo_dir}"
        )

    return repo_dir


REPO_DIR = load_repo_dir()

SOLUTIONS_DIR = REPO_DIR / "solutions"

LANGUAGE_EXTENSIONS = {
    "Python": "py",
    "Python3": "py",
    "JavaScript": "js",
    "TypeScript": "ts",
    "Java": "java",
    "C++": "cpp",
    "C": "c",
    "C#": "cs",
    "Go": "go",
    "Rust": "rs",
    "Kotlin": "kt",
    "Swift": "swift",
}


def log(message):
    print(f"[LeetPush Host] {message}", file=sys.stderr, flush=True)


def read_message():
    raw_length = sys.stdin.buffer.read(4)

    if len(raw_length) != 4:
        return None

    message_length = struct.unpack("<I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length)

    if len(message) != message_length:
        return None

    try:
        return json.loads(message.decode("utf-8"))
    except json.JSONDecodeError:
        return None


def send_message(message):
    encoded = json.dumps(message).encode("utf-8")

    sys.stdout.buffer.write(
        struct.pack("<I", len(encoded))
    )

    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def sanitize_slug(slug):
    slug = str(slug).strip().lower()

    if not slug:
        raise ValueError("Missing problem slug.")

    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("Invalid problem slug.")

    return slug


def get_extension(language):
    language = str(language).strip()

    extension = LANGUAGE_EXTENSIONS.get(language)

    if not extension:
        raise ValueError(f"Unsupported language: {language}")

    return extension


def run_git(*args):
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        error = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(
            f"git {' '.join(args)} failed: {error}"
        )

    return result.stdout.strip()


def save_and_push(output_path, commit_message):
    log("Checking Git repository...")

    run_git("rev-parse", "--is-inside-work-tree")

    status = run_git("status", "--porcelain")

    if not status:
        log("No Git changes to commit.")
        return {
            "committed": False,
            "pushed": False,
            "message": "No Git changes.",
        }

    log("Adding solution to Git...")

    run_git(
        "add",
        "--",
        str(output_path.relative_to(REPO_DIR)),
    )

    staged = run_git(
        "diff",
        "--cached",
        "--name-only",
    )

    if not staged:
        log("No staged changes.")
        return {
            "committed": False,
            "pushed": False,
            "message": "No staged changes.",
        }

    log("Creating Git commit...")

    run_git(
        "commit",
        "-m",
        commit_message,
    )

    log("Pushing to GitHub...")

    run_git(
        "push",
        "origin",
        "main",
    )

    log("Git push completed successfully.")

    return {
        "committed": True,
        "pushed": True,
        "message": "Solution committed and pushed successfully.",
    }


def handle_accepted_submission(submission):
    if not isinstance(submission, dict):
        raise ValueError("Submission must be an object.")

    status = str(submission.get("status", "")).strip()

    if status != "Accepted":
        raise ValueError("Only Accepted submissions can be saved.")

    slug = sanitize_slug(submission.get("slug", ""))

    number = str(
        submission.get("number", "")
    ).strip()

    if not re.fullmatch(r"\d+", number):
        raise ValueError("Invalid problem number.")

    language = submission.get("language", "")
    code = submission.get("code", "")

    if not isinstance(code, str) or not code.strip():
        raise ValueError("Submission code is missing.")

    extension = get_extension(language)

    SOLUTIONS_DIR.mkdir(parents=True, exist_ok=True)

    output_path = SOLUTIONS_DIR / f"{number}-{slug}.{extension}"

    output_path.write_text(
        code.rstrip() + "\n",
        encoding="utf-8"
    )

    log(f"Saved accepted solution: {output_path}")

    commit_message = (
        f"Add accepted solution: "
        f"{number}. {submission.get('title', '').strip()}"
    )

    git_result = save_and_push(
        output_path,
        commit_message,
    )

    return {
        "saved": True,
        "path": str(output_path),
        "slug": slug,
        "language": language,
        "git": git_result,
    }


def main():
    log("Native host started.")

    while True:
        message = read_message()

        if message is None:
            break

        try:
            message_type = message.get("type")

            if message_type == "accepted_submission":
                result = handle_accepted_submission(
                    message.get("submission")
                )

                send_message({
                    "ok": True,
                    "result": result
                })

                continue

            if message.get("test") == "hello":
                send_message({
                    "ok": True,
                    "received": message
                })

                continue

            send_message({
                "ok": False,
                "error": "Unknown message type."
            })

        except Exception as error:
            log(f"Error: {error}")

            send_message({
                "ok": False,
                "error": str(error)
            })


if __name__ == "__main__":
    main()
