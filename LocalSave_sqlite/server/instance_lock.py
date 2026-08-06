"""Cross-platform process lock for the local SQLite writer server."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import BinaryIO, Optional


class SqliteInstanceLockError(RuntimeError):
    """Raised when another local server already owns the SQLite writer lock."""


class SqliteInstanceLock:
    def __init__(self, lock_path: Path, database_name: str = "mdpro.sqlite") -> None:
        self.lock_path = Path(lock_path).resolve()
        self.database_name = Path(str(database_name or "mdpro.sqlite")).name
        self._handle: Optional[BinaryIO] = None
        self._acquired = False

    def _lock_handle(self, handle: BinaryIO) -> None:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            return
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    def _unlock_handle(self, handle: BinaryIO) -> None:
        handle.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            return
        import fcntl

        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def acquire(self) -> "SqliteInstanceLock":
        if self._acquired:
            return self
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.lock_path.open("a+b")
        try:
            handle.seek(0, os.SEEK_END)
            if handle.tell() == 0:
                handle.write(b" ")
                handle.flush()
            self._lock_handle(handle)
            metadata = json.dumps(
                {
                    "pid": os.getpid(),
                    "startedAt": int(time.time() * 1000),
                    "database": self.database_name,
                },
                ensure_ascii=True,
                separators=(",", ":"),
            ).encode("ascii")
            handle.seek(0)
            handle.truncate()
            handle.write(metadata)
            handle.flush()
            os.fsync(handle.fileno())
        except (OSError, BlockingIOError) as error:
            handle.close()
            raise SqliteInstanceLockError(
                "Another MD Viewer local SQLite server is already using this data folder."
            ) from error
        self._handle = handle
        self._acquired = True
        return self

    def release(self) -> None:
        handle = self._handle
        self._handle = None
        if not handle:
            self._acquired = False
            return
        try:
            if self._acquired:
                self._unlock_handle(handle)
        finally:
            self._acquired = False
            handle.close()

    def __enter__(self) -> "SqliteInstanceLock":
        return self.acquire()

    def __exit__(self, _exc_type, _exc_value, _traceback) -> None:
        self.release()
