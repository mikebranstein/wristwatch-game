"""
Tests for CloudSyncManager
===========================
Issue #82 — AC4, Test Scenarios 7, 8, 9.

Run with:
    pytest tests/
"""

import pytest
from unittest.mock import MagicMock
from src.save.cloud_sync_manager import (
    CloudSyncManager, SYNC_STATUS, SaveMetadata, ConflictInfo, CloudSyncResult
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_steam_api(save_data=None, timestamp=1234567890.0):
    """Return a minimal mock Steam API that returns the given save on read."""
    api = MagicMock()
    api.read_file.return_value = {"data": save_data or {}, "timestamp": timestamp}
    api.write_file.return_value = None
    return api


# ---------------------------------------------------------------------------
# SYNC_STATUS initial state
# ---------------------------------------------------------------------------

class TestSyncStatusInitialState:
    def test_offline_when_no_api_binding(self):
        mgr = CloudSyncManager(steam_api=None)
        assert mgr.get_sync_status() == SYNC_STATUS.OFFLINE

    def test_synced_when_api_is_provided(self):
        mgr = CloudSyncManager(steam_api=make_steam_api())
        assert mgr.get_sync_status() == SYNC_STATUS.SYNCED


# ---------------------------------------------------------------------------
# push_save
# ---------------------------------------------------------------------------

class TestPushSave:
    def test_push_returns_synced_on_success(self):
        api = make_steam_api()
        mgr = CloudSyncManager(steam_api=api)
        result = mgr.push_save({"gold": 100}, local_timestamp=1234.0)
        assert result.success is True
        assert result.status == SYNC_STATUS.SYNCED
        assert mgr.get_sync_status() == SYNC_STATUS.SYNCED

    def test_push_returns_offline_when_no_api(self):
        mgr = CloudSyncManager(steam_api=None)
        result = mgr.push_save({"gold": 100})
        assert result.success is False
        assert result.status == SYNC_STATUS.OFFLINE

    def test_push_calls_api_write_file(self):
        api = make_steam_api()
        mgr = CloudSyncManager(steam_api=api)
        mgr.push_save({"gold": 50}, local_timestamp=999.0)
        api.write_file.assert_called_once()

    def test_push_transitions_status_to_offline_on_api_error(self):
        api = MagicMock()
        api.write_file.side_effect = OSError("network error")
        mgr = CloudSyncManager(steam_api=api)
        result = mgr.push_save({"gold": 1})
        assert result.success is False
        assert mgr.get_sync_status() == SYNC_STATUS.OFFLINE

    def test_on_sync_status_changed_fires_on_push(self):
        api = make_steam_api()
        statuses = []
        mgr = CloudSyncManager(steam_api=api, on_sync_status_changed=statuses.append)
        mgr.push_save({})
        # Should have seen SYNCING then SYNCED
        assert SYNC_STATUS.SYNCING in statuses
        assert SYNC_STATUS.SYNCED in statuses


# ---------------------------------------------------------------------------
# pull_save
# ---------------------------------------------------------------------------

class TestPullSave:
    def test_pull_returns_cloud_save_data_and_timestamp(self):
        api = make_steam_api(save_data={"gold": 300}, timestamp=5000.0)
        mgr = CloudSyncManager(steam_api=api)
        save_data, ts = mgr.pull_save()
        assert save_data == {"gold": 300}
        assert ts == 5000.0

    def test_pull_returns_none_when_offline(self):
        mgr = CloudSyncManager(steam_api=None)
        data, ts = mgr.pull_save()
        assert data is None
        assert ts is None

    def test_pull_returns_none_when_api_returns_none(self):
        api = MagicMock()
        api.read_file.return_value = None
        mgr = CloudSyncManager(steam_api=api)
        data, ts = mgr.pull_save()
        assert data is None
        assert ts is None


# ---------------------------------------------------------------------------
# detect_conflict — Test Scenarios 7, 8, 9
# ---------------------------------------------------------------------------

class TestDetectConflict:
    def test_no_conflict_when_offline(self):
        """Scenario 9 (partial): no cloud save → no conflict."""
        mgr = CloudSyncManager(steam_api=None)
        info = mgr.detect_conflict({"gold": 10}, local_timestamp=1000.0)
        assert info.has_conflict is False

    def test_no_conflict_when_api_returns_no_cloud_save(self):
        api = MagicMock()
        api.read_file.return_value = None
        mgr = CloudSyncManager(steam_api=api)
        info = mgr.detect_conflict({"gold": 10}, local_timestamp=1000.0)
        assert info.has_conflict is False

    def test_conflict_when_timestamps_differ(self):
        """Scenario 7: local and cloud saves have different timestamps."""
        api = make_steam_api(
            save_data={"gold": 200, "last_checkpoint_stage": "cleaning"},
            timestamp=2000.0,
        )
        mgr = CloudSyncManager(steam_api=api)
        local = {"gold": 250, "last_checkpoint_stage": "sourcing"}
        info = mgr.detect_conflict(local, local_timestamp=3000.0)
        assert info.has_conflict is True
        assert info.local_meta is not None
        assert info.cloud_meta is not None

    def test_conflict_metadata_includes_stage_info(self):
        """AC4: conflict UI shows last-known stage progress."""
        api = make_steam_api(
            save_data={"last_checkpoint_stage": "teardown"},
            timestamp=1000.0,
        )
        mgr = CloudSyncManager(steam_api=api)
        local = {"last_checkpoint_stage": "reassembly"}
        info = mgr.detect_conflict(local, local_timestamp=2000.0)

        assert info.local_meta.last_known_stage == "reassembly"
        assert info.cloud_meta.last_known_stage == "teardown"

    def test_conflict_sets_sync_status_to_conflict(self):
        """AC4: sync status transitions to CONFLICT when conflict detected."""
        api = make_steam_api(timestamp=999.0)
        mgr = CloudSyncManager(steam_api=api)
        mgr.detect_conflict({}, local_timestamp=1.0)
        assert mgr.get_sync_status() == SYNC_STATUS.CONFLICT

    def test_conflict_when_local_timestamp_is_none(self):
        """When local timestamp is unavailable, treat as potential conflict."""
        api = make_steam_api(timestamp=5000.0)
        mgr = CloudSyncManager(steam_api=api)
        info = mgr.detect_conflict({}, local_timestamp=None)
        assert info.has_conflict is True


# ---------------------------------------------------------------------------
# SaveMetadata timestamp display
# ---------------------------------------------------------------------------

class TestSaveMetadata:
    def test_timestamp_display_when_timestamp_available(self):
        meta = SaveMetadata(timestamp=0.0, last_known_stage="teardown", source="local")
        assert "1970" in meta.timestamp_display

    def test_timestamp_display_unavailable_when_none(self):
        meta = SaveMetadata(timestamp=None, last_known_stage=None, source="cloud")
        assert meta.timestamp_display == "timestamp unavailable"
