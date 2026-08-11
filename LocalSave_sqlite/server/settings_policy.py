"""Allow-list and validation rules for shareable SQLite settings.

Secrets and device-only state are deliberately absent from ``SAFE_SETTING_RULES``.
Every write path (migration and settings API) calls this module so a modified
browser cannot place credentials in the SQLite database.
"""

from __future__ import annotations

import json
import re
import base64
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional


SENSITIVE_KEY_RE = re.compile(
    r"(?:api[_-]?key|token|secret|password|passwd|credential|private[_-]?key|access[_-]?key|password[_-]?hash|verified)",
    re.IGNORECASE,
)

PROBABLE_SECRET_VALUE_RE = re.compile(
    r"(?:AIza[0-9A-Za-z_-]{30,}|sk-[0-9A-Za-z_-]{16,})"
)

PROTECTED_TOOL_IDS = frozenset({"gemini", "deepseek", "openai", "imgbb", "fmaGemini", "lmstudio"})
CATALOG_TOOL_IDS = frozenset({"scholarAI", "sspimgAI", "aiJena", "imgbb", "fmaAiJena"})

TRANSIENT_SETTING_KEYS = frozenset(
    {
        "id",
        "sqliteEnabled",
        "githubCacheDocs",
        "githubLastPulledAt",
        "verified",
        "passwordHash",
    }
)


@dataclass(frozen=True)
class SettingRule:
    group: str
    default_scope: str
    allowed_types: tuple[str, ...]
    max_bytes: int = 256 * 1024


def _boolean(group: str = "features") -> SettingRule:
    return SettingRule(group, "global", ("boolean",), 16)


SAFE_SETTING_RULES: Dict[str, SettingRule] = {
    # Feature visibility and editor behavior.
    "aiMasterEnabled": _boolean(),
    "scholarAI": _boolean(),
    "sspimgAI": _boolean(),
    "imageUploadEnabled": _boolean(),
    "scholarSearchVisible": _boolean(),
    "highlightVisible": _boolean(),
    "sitesVisible": _boolean(),
    "macroVisible": _boolean(),
    "templateVisible": _boolean(),
    "html2pptVisible": _boolean(),
    "html2pptNameVisible": _boolean(),
    "fmaViewerVisible": _boolean(),
    "fmaViewerNameVisible": _boolean(),
    "googleCalendarEnabled": _boolean(),
    "googleDocsUseEnabled": _boolean(),
    "toDocsVisible": _boolean(),
    "docSyncVisible": _boolean(),
    "githubEnabled": _boolean(),
    "enterButtonInsertBr": _boolean("editor"),
    "selectionWrapEnabled": _boolean("editor"),
    "viewModeEditEnabled": _boolean("editor"),
    # Non-secret provider/repository preferences.
    "deepseekBaseUrl": SettingRule("integrations", "workspace", ("string",), 4096),
    "githubRepo": SettingRule("integrations", "workspace", ("string",), 1024),
    "githubBranch": SettingRule("integrations", "workspace", ("string",), 256),
    "githubDefaultPushPath": SettingRule("integrations", "workspace", ("string",), 2048),
    "githubPullMaxFiles": SettingRule("integrations", "workspace", ("number",), 32),
    "googleDocsClientId": SettingRule("integrations", "workspace", ("string",), 4096),
    "googleCalendarOpenMode": SettingRule("integrations", "profile", ("string",), 64),
    "googleCalendarEmail": SettingRule("integrations", "profile", ("string",), 1024),
    "naverBlogId": SettingRule("integrations", "profile", ("string",), 1024),
    # User-managed collections and profile metadata.
    "sitesList": SettingRule("collections", "workspace", ("array",), 2 * 1024 * 1024),
    "templateCustomList": SettingRule("collections", "workspace", ("array",), 4 * 1024 * 1024),
    "tidyCustomScripts": SettingRule("collections", "workspace", ("array",), 4 * 1024 * 1024),
    "shareSites": SettingRule("collections", "workspace", ("array",), 256 * 1024),
    "customShareDestinations": SettingRule("collections", "workspace", ("array",), 2 * 1024 * 1024),
    "userInfo": SettingRule("profile", "profile", ("object",), 64 * 1024),
    # Ciphertext-only credential envelope and its non-secret explorer catalog.
    "encryptedToolVault": SettingRule("security", "profile", ("object",), 512 * 1024),
    "toolSettingsCatalog": SettingRule("integrations", "profile", ("object",), 2 * 1024 * 1024),
}

VALID_SCOPES = frozenset({"global", "profile", "workspace", "document", "feature"})
SCOPE_PRIORITY = ("global", "profile", "workspace", "feature", "document")


class SettingPolicyError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def value_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "json"


def contains_sensitive_key(value: Any) -> bool:
    """Reject secret-looking fields even when hidden inside an allowed object."""
    if isinstance(value, dict):
        for key, child in value.items():
            if SENSITIVE_KEY_RE.search(str(key)) or contains_sensitive_key(child):
                return True
    elif isinstance(value, list):
        return any(contains_sensitive_key(item) for item in value)
    return False


def _require_exact_keys(value: Dict[str, Any], allowed: set[str], label: str) -> None:
    unknown = set(value.keys()) - allowed
    if unknown:
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", f"{label} contains unsupported fields.")


def _is_base64(value: Any, *, min_bytes: int, max_bytes: int) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, TypeError):
        return False
    return min_bytes <= len(decoded) <= max_bytes


def _validate_encrypted_tool_vault(value: Any) -> None:
    if not isinstance(value, dict):
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault must be an object.")
    _require_exact_keys(
        value,
        {"version", "algorithm", "derivation", "iterations", "salt", "iv", "ciphertext", "entries", "updatedAt"},
        "Encrypted tool vault",
    )
    if value.get("version") != 1 or value.get("algorithm") != "AES-GCM" or value.get("derivation") != "PBKDF2-SHA256":
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault algorithm metadata is invalid.")
    iterations = value.get("iterations")
    if not isinstance(iterations, int) or isinstance(iterations, bool) or not 200_000 <= iterations <= 2_000_000:
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault iteration count is invalid.")
    if not _is_base64(value.get("salt"), min_bytes=16, max_bytes=32):
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault salt is invalid.")
    if not _is_base64(value.get("iv"), min_bytes=12, max_bytes=12):
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault IV is invalid.")
    if not _is_base64(value.get("ciphertext"), min_bytes=17, max_bytes=384 * 1024):
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault ciphertext is invalid.")
    entries = value.get("entries")
    if not isinstance(entries, list) or len(entries) > len(PROTECTED_TOOL_IDS):
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault entry metadata is invalid.")
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault entry must be an object.")
        _require_exact_keys(entry, {"id", "label", "configured", "last4"}, "Encrypted tool vault entry")
        entry_id = entry.get("id")
        if entry_id not in PROTECTED_TOOL_IDS or entry_id in seen:
            raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault entry ID is invalid.")
        seen.add(entry_id)
        if not isinstance(entry.get("label"), str) or len(entry["label"]) > 80:
            raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault entry label is invalid.")
        if not isinstance(entry.get("configured"), bool):
            raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault configured flag is invalid.")
        last4 = entry.get("last4")
        if not isinstance(last4, str) or len(last4) > 4:
            raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault last4 metadata is invalid.")
    if not isinstance(value.get("updatedAt"), str) or len(value["updatedAt"]) > 64:
        raise SettingPolicyError("INVALID_PROTECTED_SETTING", "Encrypted tool vault timestamp is invalid.")


def _validate_tool_settings_catalog(value: Any) -> None:
    if not isinstance(value, dict):
        raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool settings catalog must be an object.")
    _require_exact_keys(value, {"version", "updatedAt", "tools"}, "Tool settings catalog")
    if value.get("version") != 1 or not isinstance(value.get("updatedAt"), str):
        raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool settings catalog metadata is invalid.")
    tools = value.get("tools")
    if not isinstance(tools, list) or len(tools) > len(CATALOG_TOOL_IDS):
        raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool settings catalog tools are invalid.")
    seen: set[str] = set()
    for tool in tools:
        if not isinstance(tool, dict):
            raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool settings catalog item must be an object.")
        _require_exact_keys(
            tool,
            {"id", "label", "enabled", "provider", "model", "prompt", "endpoint", "options", "protection"},
            "Tool settings catalog item",
        )
        tool_id = tool.get("id")
        if tool_id not in CATALOG_TOOL_IDS or tool_id in seen:
            raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool settings catalog ID is invalid.")
        seen.add(tool_id)
        if not isinstance(tool.get("enabled"), bool):
            raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool enabled flag is invalid.")
        for field, maximum in (("label", 80), ("provider", 80), ("model", 256), ("prompt", 65536), ("endpoint", 4096)):
            field_value = tool.get(field)
            if not isinstance(field_value, str) or len(field_value) > maximum or PROBABLE_SECRET_VALUE_RE.search(field_value):
                raise SettingPolicyError("INVALID_TOOL_CATALOG", f"Tool catalog {field} is invalid or contains a probable secret.")
        if not isinstance(tool.get("options"), dict) or contains_sensitive_key(tool["options"]):
            raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool catalog options are invalid.")
        protection = tool.get("protection")
        if not isinstance(protection, dict):
            raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool protection metadata is invalid.")
        _require_exact_keys(protection, {"configured", "locked", "last4"}, "Tool protection metadata")
        if not isinstance(protection.get("configured"), bool) or not isinstance(protection.get("locked"), bool):
            raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool protection flags are invalid.")
        if not isinstance(protection.get("last4"), str) or len(protection["last4"]) > 4:
            raise SettingPolicyError("INVALID_TOOL_CATALOG", "Tool protection last4 metadata is invalid.")


def validate_special_setting(key: str, value: Any) -> None:
    if key == "encryptedToolVault":
        _validate_encrypted_tool_vault(value)
    elif key == "toolSettingsCatalog":
        _validate_tool_settings_catalog(value)


def default_scope_id(scope_type: str, profile_id: str, workspace_id: str) -> str:
    if scope_type == "global":
        return ""
    if scope_type == "profile":
        return profile_id
    if scope_type == "workspace":
        return workspace_id
    return ""


def validate_setting(
    key: Any,
    value: Any,
    *,
    scope_type: Optional[Any] = None,
    scope_id: Optional[Any] = None,
    profile_id: str = "profile_default",
    workspace_id: str = "workspace_default",
) -> Dict[str, Any]:
    normalized_key = str(key or "").strip()
    if not normalized_key:
        raise SettingPolicyError("SETTING_KEY_REQUIRED", "settingKey is required.")
    if SENSITIVE_KEY_RE.search(normalized_key):
        raise SettingPolicyError("SENSITIVE_SETTING_BLOCKED", "Sensitive settings cannot be stored in SQLite.")
    rule = SAFE_SETTING_RULES.get(normalized_key)
    if not rule:
        raise SettingPolicyError("SETTING_NOT_ALLOWED", "Setting is not in the SQLite allow-list.")
    if contains_sensitive_key(value):
        raise SettingPolicyError("SENSITIVE_NESTED_SETTING_BLOCKED", "Nested sensitive values cannot be stored in SQLite.")
    validate_special_setting(normalized_key, value)

    normalized_scope = str(scope_type or rule.default_scope).strip().lower()
    if normalized_scope not in VALID_SCOPES:
        raise SettingPolicyError("INVALID_SETTING_SCOPE", "Setting scope is invalid.")
    normalized_scope_id = str(scope_id if scope_id is not None else "").strip()
    if not normalized_scope_id:
        normalized_scope_id = default_scope_id(normalized_scope, profile_id, workspace_id)
    if normalized_scope == "global":
        normalized_scope_id = ""
    elif not normalized_scope_id:
        raise SettingPolicyError("SETTING_SCOPE_ID_REQUIRED", "scopeId is required for this setting scope.")
    if len(normalized_scope_id) > 128:
        raise SettingPolicyError("SETTING_SCOPE_ID_TOO_LONG", "scopeId is too long.")

    normalized_type = value_type(value)
    if normalized_type not in rule.allowed_types:
        raise SettingPolicyError("INVALID_SETTING_TYPE", "Setting value type is invalid.")
    try:
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as error:
        raise SettingPolicyError("INVALID_SETTING_VALUE", "Setting value must be valid JSON.") from error
    if len(encoded.encode("utf-8")) > rule.max_bytes:
        raise SettingPolicyError("SETTING_VALUE_TOO_LARGE", "Setting value is too large.")
    return {
        "scopeType": normalized_scope,
        "scopeId": normalized_scope_id,
        "group": rule.group,
        "key": normalized_key,
        "value": value,
        "valueJson": encoded,
        "valueType": normalized_type,
    }


def safe_key_names() -> Iterable[str]:
    return SAFE_SETTING_RULES.keys()
