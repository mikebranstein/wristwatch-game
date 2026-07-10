from src.save.save_system import SaveSystem

class TestCollectionGallerySaveSystem:
    save_system = SaveSystem()
    def test_new_save_defaults_to_empty_list(self):
        _, _, u = self.save_system.load_session(None)
        assert u.get('completed_watches') == []
    def test_pre_feature_save_no_key_defaults_to_empty(self):
        _, _, u = self.save_system.load_session({'gold': 500})
        assert u.get('completed_watches') == []
    def test_none_coerced_to_empty_list(self):
        _, _, u = self.save_system.load_session({'completed_watches': None})
        assert u.get('completed_watches') == []
    def test_existing_entries_preserved(self):
        entries = [{'watch_name': 'Seiko'}]
        _, _, u = self.save_system.load_session({'completed_watches': entries})
        assert u['completed_watches'] == entries
    def test_multiple_entries_preserved(self):
        entries = [{'watch_name': 'A'}, {'watch_name': 'B'}]
        _, _, u = self.save_system.load_session({'completed_watches': entries})
        assert len(u['completed_watches']) == 2
    def test_does_not_clobber_other_fields(self):
        _, _, u = self.save_system.load_session({'gold': 999})
        assert u['gold'] == 999
        assert u.get('completed_watches') == []
    def test_order_queue_unaffected(self):
        _, _, u = self.save_system.load_session({'completed_watches': [{'watch_name': 'Omega'}]})
        assert 'order_queue' in u
        assert u['completed_watches'][0]['watch_name'] == 'Omega'