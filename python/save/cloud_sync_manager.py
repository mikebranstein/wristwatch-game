"""
CloudSyncManager — Steam Cloud save API wrapper
================================================

Wraps the Steam Cloud save API to provide:

  push_save(save_data, local_timestamp)
      Upload local save to Steam Cloud.  Returns a CloudSyncResult.

  pull_save()
      Download the most recent save from Steam Cloud.
      Returns (save_data: dict | None, cloud_timestamp: float | None).

  detect_conflict(local_save_data, local_timestamp)
      Compare local and cloud save metadata.
      Returns ConflictInfo(has_conflict, local_meta, cloud_meta) or None if in sync.

  get_sync_status()
      Returns one of SYNC_STATUS constants: SYNCED, SYNCING, CONFLICT, OFFLINE.

Steam Cloud metadata contract
------------------------------
The Steam Cloud SDK exposes ``ugcTimestamp`` (epoch seconds) and an optional
``last_known_stage`` field in file metadata.  When timestamp metadata is
unavailable (older saves / API quirks), conflict resolution falls back to
timestamp-only display with a "timestamp unavailable" label (per design
constraint).

This class is designed as a thin, mockable wrapper so tests never touch a real
Steam Cloud connection.  In production, replace ``_steam_api`` with the actual
Steam Cloud SDK bindings.

Issue #82 — AC4, Test Scenarios 7, 8, 9.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable, Optional


# ---------------------------------------------------------------------------
# Sync status constants
# ---------------------------------------------------------------------------

class SYNC_STATUS:
    SYNCED   = "SYNCED"
    SYNCING  = "SYNCING"
    CONFLICT = "CONFLICT"
    OFFLINE  = "OFFLINE"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class SaveMetadata:
    """Lightweight metadata snapshot for a save file (local or cloud)."""
    timestamp: Optional[float]          # epoch seconds; None when unavailable
    last_known_stage: Optional[str]     # e.g. 'teardown', 'cleaning', or None
    source: str                         # 'local' | 'cloud'
    timestamp_display: str = field(init=False)

    def __post_init__(self) -> None:
        if self.timestamp is not None:
            from datetime import datetime, timezone
            dt = datetime.fromtimestamp(self.timestamp, tz=timezone.utc)
            self.timestamp_display = dt.strftime("%Y-%m-%d %H:%M UTC")
        else:
            self.timestamp_display = "timestamp unavailable"


@dataclass
class ConflictInfo:
    """Describes a conflict between local and cloud saves."""
    has_conflict: bool
    local_meta:  Optional[SaveMetadata]
    cloud_meta:  Optional[SaveMetadata]


@dataclass
class CloudSyncResult:
    """Result of a push or pull operation."""
    success:       bool
    status:        str                  # one of SYNC_STATUS
    error_message: Optional[str] = None


# ---------------------------------------------------------------------------
# CloudSyncManager
# ---------------------------------------------------------------------------

class CloudSyncManager:
    """
    Steam Cloud API wrapper for save push/pull and conflict detection (Issue #82 AC4).

    Parameters
    ----------
    steam_api : object | None
        Injected Steam Cloud API binding.  When None, the manager operates in
        offline / stub mode — all pushes are no-ops, pulls return None.
    on_sync_status_changed : callable | None
        Optional callback ``(new_status: str) -> None`` fired whenever the
        sync status transitions.
    """

    def __init__(
        self,
        steam_api: Any = None,
        on_sync_status_changed: Optional[Callable[[str], None]] = None,
    ) -> None:
        self._api    = steam_api
        self._status = SYNC_STATUS.OFFLINE if steam_api is None else SYNC_STATUS.SYNCED
        self._on_status_changed = on_sync_status_changed

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def get_sync_status(self) -> str:
        """Return the current sync status string (one of SYNC_STATUS constants)."""
        return self._status

    def push_save(
        self,
        save_data: dict,
        local_timestamp: Optional[float] = None,
    ) -> CloudSyncResult:
        """
        Upload *save_data* to Steam Cloud.

        When offline (no API binding), records the pending push and returns
        OFFLINE status so the caller can display the correct UX state.

        AC4: never silently overwrites cloud state without player confirmation
        when a conflict exists — callers must call detect_conflict() first.
        """
        if self._api is None:
            return CloudSyncResult(
                success=False,
                status=SYNC_STATUS.OFFLINE,
                error_message="No Steam Cloud API binding — operating offline.",
            )

        self._set_status(SYNC_STATUS.SYNCING)
        try:
            self._api.write_file(save_data, timestamp=local_timestamp)
            self._set_status(SYNC_STATUS.SYNCED)
            return CloudSyncResult(success=True, status=SYNC_STATUS.SYNCED)
        except Exception as exc:
            self._set_status(SYNC_STATUS.OFFLINE)
            return CloudSyncResult(
                success=False,
                status=SYNC_STATUS.OFFLINE,
                error_message=str(exc),
            )

    def pull_save(self) -> tuple[Optional[dict], Optional[float]]:
        """
        Download the most recent save from Steam Cloud.

        Returns
        -------
        (save_data, cloud_timestamp)
            Both fields are None when offline or when no cloud save exists.
        """
        if self._api is None:
            return None, None

        try:
            result = self._api.read_file()
            if result is None:
                return None, None
            save_data  = result.get("data")
            cloud_ts   = result.get("timestamp")
            return save_data, cloud_ts
        except Exception:
            self._set_status(SYNC_STATUS.OFFLINE)
            return None, None

    def detect_conflict(
        self,
        local_save_data: dict,
        local_timestamp: Optional[float],
    ) -> ConflictInfo:
        """
        Detect whether a conflict exists between *local_save_data* and the cloud save.

        A conflict is defined as: both a local save AND a cloud save exist, and their
        timestamps differ (or one is missing — treated as potential overwrite risk).

        Parameters
        ----------
        local_save_data : dict
        local_timestamp : float | None
            Epoch seconds of the local save.  None when unavailable.

        Returns
        -------
        ConflictInfo
            ``has_conflict=True`` when both saves exist and differ.
        """
        cloud_data, cloud_ts = self.pull_save()

        if cloud_data is None:
            # No cloud save — no conflict.
            return ConflictInfo(has_conflict=False, local_meta=None, cloud_meta=None)

        local_meta = SaveMetadata(
            timestamp=local_timestamp,
            last_known_stage=local_save_data.get("last_checkpoint_stage"),
            source="local",
        )
        cloud_meta = SaveMetadata(
            timestamp=cloud_ts,
            last_known_stage=(cloud_data or {}).get("last_checkpoint_stage"),
            source="cloud",
        )

        # Conflict when timestamps differ (or either is unavailable — conservative).
        has_conflict = (local_timestamp != cloud_ts) or (
            local_timestamp is None or cloud_ts is None
        )

        # Adjust sync status for UI display.
        if has_conflict:
            self._set_status(SYNC_STATUS.CONFLICT)

        return ConflictInfo(
            has_conflict=has_conflict,
            local_meta=local_meta,
            cloud_meta=cloud_meta,
        )

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    def _set_status(self, new_status: str) -> None:
        if new_status != self._status:
            self._status = new_status
            if self._on_status_changed is not None:
                self._on_status_changed(new_status)
