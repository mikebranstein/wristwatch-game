"""
Tests for Collection Gallery save compatibility
=============================================

Issue #127 / #129 additive save-schema coverage for completed_watches.
"""

from src.save.save_system import SaveSystem


class TestCollectionGallerySaveCompatibility:
    save_system = SaveSystem()

    def test_none_raw_save_data_defaults_completed_watches_to_empty_list(self):
        _, _, updated = self.save_system.load_session(None)
        assert updated["completed_watches"] == []

    def test_pre_feature_save_without_completed_watches_defaults_to_empty_list(self):
        _, _, updated = self.save_system.load_session({"gold": 12})
        assert updated["completed_watches"] == []

    def test_completed_watches_none_is_coerced_to_empty_list(self):
        _, _, updated = self.save_system.load_session({"completed_watches": None})
        assert updated["completed_watches"] == []

    def test_existing_completed_watches_entries_are_preserved(self):
        entries = [{"watch_name": "Omega", "client_name": "Alex"}]
        _, _, updated = self.save_system.load_session({"completed_watches": entries})
        assert updated["completed_watches"] == entries

    def test_other_fields_are_untouched_when_completed_watches_added(self):
        raw = {"gold": 50, "player_level": 3}
        _, _, updated = self.save_system.load_session(raw)
        assert updated["gold"] == 50
        assert updated["player_level"] == 3
