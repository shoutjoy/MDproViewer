"""Tests the process-level SQLite writer lock without opening the live database."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from LocalSave_sqlite.server.instance_lock import SqliteInstanceLock  # noqa: E402


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def probe_script(lock_path: Path) -> str:
    return (
        "from pathlib import Path; "
        "from LocalSave_sqlite.server.instance_lock import SqliteInstanceLock, SqliteInstanceLockError; "
        f"lock=SqliteInstanceLock(Path({str(lock_path)!r}), 'probe.sqlite'); "
        "\ntry:\n lock.acquire(); print('ACQUIRED'); lock.release()"
        "\nexcept SqliteInstanceLockError:\n print('BLOCKED')"
    )


def run_probe(lock_path: Path) -> str:
    result = subprocess.run(
        [sys.executable, "-c", probe_script(lock_path)],
        cwd=APP_ROOT,
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    return result.stdout.strip()


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sqlite-instance-lock-", dir=APP_ROOT / "LocalSave_sqlite") as temp_name:
        lock_path = Path(temp_name) / "data" / "mdviewer.instance.lock"
        first = SqliteInstanceLock(lock_path, "test-db.sqlite")
        first.acquire()
        try:
            require(run_probe(lock_path) == "BLOCKED", "second process acquired the writer lock")
        finally:
            first.release()
        metadata = json.loads(lock_path.read_text(encoding="ascii"))
        require(metadata["database"] == "test-db.sqlite", "lock metadata database mismatch")
        require("content" not in metadata and "apiKey" not in metadata, "lock metadata leaked application data")
        require(run_probe(lock_path) == "ACQUIRED", "lock was not reusable after release")
        print("SQLite instance lock tests passed")


if __name__ == "__main__":
    main()
