"""Allow-list and validation rules for shareable SQLite settings.

Secrets and device-only state are deliberately absent from ``SAFE_SETTING_RULES``.
Every write path (migration and settings API) calls this module so a modified
browser cannot place credentials in the SQLite database.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional


SENSITIVE_KEY_RE = re.compile(
    r"(?:api[_-]?key|token|secret|password|passwd|credential|private[_-]?key|access[_-]?key|password[_-]?hash|verified)",
    re.IGNORECASE,
)

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
    "fmaViewerVisible": _boolean(),
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
    "shareSites": SettingRule("collections", "workspace", ("array",), 256 * 1024),
    "customShareDestinations": SettingRule("collections", "workspace", ("array",), 2 * 1024 * 1024),
    "userInfo": SettingRule("profile", "profile", ("object",), 64 * 1024),
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
