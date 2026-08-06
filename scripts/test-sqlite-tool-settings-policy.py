from __future__ import annotations

import base64
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from LocalSave_sqlite.server.settings_policy import SettingPolicyError, validate_setting
from LocalSave_sqlite.server.database import DatabaseManager
from LocalSave_sqlite.server.repositories import StorageRepository


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    envelope = {
        "version": 1,
        "algorithm": "AES-GCM",
        "derivation": "PBKDF2-SHA256",
        "iterations": 310000,
        "salt": base64.b64encode(b"1" * 16).decode("ascii"),
        "iv": base64.b64encode(b"2" * 12).decode("ascii"),
        "ciphertext": base64.b64encode(b"3" * 32).decode("ascii"),
        "entries": [{"id": "gemini", "label": "Google AI Studio", "configured": True, "last4": "1234"}],
        "updatedAt": "2026-08-06T14:20:00.000Z",
    }
    normalized = validate_setting("encryptedToolVault", envelope)
    require(normalized["group"] == "security", "vault group mismatch")

    catalog = {
        "version": 1,
        "updatedAt": "2026-08-06T14:20:00.000Z",
        "tools": [{
            "id": "scholarAI", "label": "ScholarAI", "enabled": True,
            "provider": "aistudio", "model": "gemini-2.5-pro", "prompt": "학술 근거를 우선합니다.",
            "endpoint": "", "options": {"responseMode": "quick"},
            "protection": {"configured": True, "locked": True, "last4": "1234"},
        }],
    }
    normalized_catalog = validate_setting("toolSettingsCatalog", catalog)
    require(normalized_catalog["group"] == "integrations", "catalog group mismatch")

    with tempfile.TemporaryDirectory(prefix="sqlite-tool-settings-", dir=ROOT / "LocalSave_sqlite") as temp_name:
        manager = DatabaseManager(ROOT, data_root=Path(temp_name) / "data")
        manager.initialize()
        repository = StorageRepository(manager)
        repository.put_setting({"key": "encryptedToolVault", "value": envelope, "scopeType": "profile"})
        repository.put_setting({"key": "toolSettingsCatalog", "value": catalog, "scopeType": "profile"})
        explorer = repository.get_explorer_snapshot(query="ScholarAI")
        require(len(explorer["settings"]) == 1, "catalog value search failed")
        require(explorer["settings"][0]["key"] == "toolSettingsCatalog", "catalog search returned wrong setting")
        serialized_explorer = str(explorer)
        require("AIza" not in serialized_explorer and "sk-" not in serialized_explorer, "explorer leaked a probable key")

    invalid = dict(envelope)
    invalid["plaintext"] = "AIza01234567890123456789012345678901234"
    try:
        validate_setting("encryptedToolVault", invalid)
        raise AssertionError("unsupported vault field was accepted")
    except SettingPolicyError as error:
        require(error.code in {"INVALID_PROTECTED_SETTING", "SENSITIVE_NESTED_SETTING_BLOCKED"}, "unexpected vault rejection")

    leaked_catalog = {**catalog, "tools": [{**catalog["tools"][0], "prompt": "sk-abcdefghijklmnopqrstuvwxyz"}]}
    try:
        validate_setting("toolSettingsCatalog", leaked_catalog)
        raise AssertionError("probable API key in catalog was accepted")
    except SettingPolicyError as error:
        require(error.code == "INVALID_TOOL_CATALOG", "unexpected catalog leak rejection")

    bad_ciphertext = {**envelope, "ciphertext": "not-base64"}
    try:
        validate_setting("encryptedToolVault", bad_ciphertext)
        raise AssertionError("invalid ciphertext was accepted")
    except SettingPolicyError as error:
        require(error.code == "INVALID_PROTECTED_SETTING", "unexpected ciphertext rejection")

    print("SQLite tool settings policy tests passed.")


if __name__ == "__main__":
    main()
