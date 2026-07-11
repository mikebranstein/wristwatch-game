"""
Tests for PreviouslyOrdered and OrderHistory — AC4

AC4: The "Previously Ordered" section is present in the catalog and shows
     up to the 10 most recently ordered unique parts. Clicking reorder on
     any entry pre-populates the order form with the correct part and
     default quantity.

Scenario 7 — Player with prior order history opens catalog →
             "Previously Ordered" section shows up to 10 parts →
             one-click reorder correctly pre-populates the order form.
"""

import pytest
from catalog.data.order_history import OrderHistory, MAX_PREVIOUSLY_ORDERED, OrderEntry
from catalog.previously_ordered import PreviouslyOrdered


class TestOrderHistory:
    """Unit tests for the OrderHistory model (backing store for AC4)."""

    def test_new_history_starts_empty(self):
        h = OrderHistory()
        assert h.count == 0
        assert h.get_recently_ordered() == []

    def test_recording_an_order_adds_it_to_history(self):
        h = OrderHistory()
        h.record_order("ms-eta2824-std", "ETA 2824 Mainspring", 1)
        assert h.count == 1
        entries = h.get_recently_ordered()
        assert entries[0].part_id == "ms-eta2824-std"
        assert entries[0].default_quantity == 1

    def test_most_recently_ordered_part_appears_first(self):
        h = OrderHistory()
        h.record_order("part-a", "Part A", 1, ordered_at=1000.0)
        h.record_order("part-b", "Part B", 1, ordered_at=2000.0)
        h.record_order("part-c", "Part C", 1, ordered_at=3000.0)

        entries = h.get_recently_ordered()
        assert entries[0].part_id == "part-c"
        assert entries[1].part_id == "part-b"
        assert entries[2].part_id == "part-a"

    def test_reordering_existing_part_moves_it_to_front(self):
        h = OrderHistory()
        h.record_order("part-a", "Part A", 1)
        h.record_order("part-b", "Part B", 1)
        h.record_order("part-a", "Part A", 2)  # reorder with new quantity

        entries = h.get_recently_ordered()
        assert entries[0].part_id == "part-a"
        assert entries[0].default_quantity == 2

    def test_deduplication_removes_old_occurrence_of_reordered_part(self):
        h = OrderHistory()
        h.record_order("part-a", "Part A", 1)
        h.record_order("part-b", "Part B", 1)
        h.record_order("part-a", "Part A", 2)

        ids = [e.part_id for e in h.get_recently_ordered()]
        assert ids.count("part-a") == 1

    def test_history_is_capped_at_max_previously_ordered(self):
        h = OrderHistory()
        for i in range(1, 16):
            h.record_order(f"part-{i}", f"Part {i}", 1)

        assert h.count == MAX_PREVIOUSLY_ORDERED
        assert len(h.get_recently_ordered()) == MAX_PREVIOUSLY_ORDERED

    def test_oldest_parts_dropped_when_cap_exceeded(self):
        h = OrderHistory()
        for i in range(1, 16):
            h.record_order(f"part-{i}", f"Part {i}", 1)

        ids = {e.part_id for e in h.get_recently_ordered()}
        # Most recent 10 (part-15 down to part-6) should be retained
        assert "part-15" in ids
        assert "part-6" in ids
        # Oldest 5 should have been evicted
        assert "part-1" not in ids
        assert "part-5" not in ids

    def test_get_recently_ordered_returns_a_copy_not_internal_reference(self):
        h = OrderHistory()
        h.record_order("part-a", "Part A", 1)

        entries = h.get_recently_ordered()
        entries.append(OrderEntry("injected", "Injected", 1, 0.0))

        assert h.count == 1  # internal state unchanged

    def test_clear_empties_history(self):
        h = OrderHistory()
        h.record_order("part-a", "Part A", 1)
        h.clear()
        assert h.count == 0


class TestPreviouslyOrdered:
    """Tests for the PreviouslyOrdered catalog section (AC4)."""

    def setup_method(self):
        self.history = OrderHistory()
        self.history.record_order("ms-eta2824-std", "ETA 2824 Mainspring (Standard)", 1, ordered_at=1000.0)
        self.history.record_order("bw-eta2824-std", "ETA 2824 Balance Wheel Assembly", 2, ordered_at=2000.0)
        self.history.record_order("pf-eta2824-std", "ETA 2824 Pallet Fork", 1, ordered_at=3000.0)
        self.po = PreviouslyOrdered(self.history)

    def test_get_entries_returns_previously_ordered_list(self):
        """AC4 — get_entries returns the expected parts in most-recent-first order."""
        entries = self.po.get_entries()
        assert len(entries) == 3
        assert entries[0].part_id == "pf-eta2824-std"  # most recent first

    def test_has_entries_true_when_history_non_empty(self):
        """AC4 — has_entries is True when order history is non-empty."""
        assert self.po.has_entries is True

    def test_has_entries_false_when_history_empty(self):
        """AC4 — has_entries is False when order history is empty."""
        po = PreviouslyOrdered(OrderHistory())
        assert po.has_entries is False

    def test_scenario7_build_reorder_payload_returns_correct_pre_populated_form(self):
        """AC4 (Scenario 7) — buildReorderPayload returns correct pre-populated order form payload."""
        payload = self.po.build_reorder_payload("bw-eta2824-std")

        assert payload is not None
        assert payload.part_id == "bw-eta2824-std"
        assert payload.part_name == "ETA 2824 Balance Wheel Assembly"
        assert payload.quantity == 2
        assert payload.source == "previously-ordered"

    def test_scenario7_reorder_payload_source_identifies_origin(self):
        """AC4 (Scenario 7) — payload source is 'previously-ordered'."""
        payload = self.po.build_reorder_payload("ms-eta2824-std")
        assert payload.source == "previously-ordered"

    def test_build_reorder_payload_returns_none_for_unknown_part(self):
        """AC4 — returns None if the part_id is not in order history."""
        payload = self.po.build_reorder_payload("nonexistent-part")
        assert payload is None

    def test_catalog_section_shows_up_to_10_entries_maximum(self):
        """AC4 (Scenario 7) — Previously Ordered section is capped at 10 entries."""
        h = OrderHistory()
        for i in range(1, 13):
            h.record_order(f"part-{i}", f"Part {i}", 1)
        po = PreviouslyOrdered(h)

        assert len(po.get_entries()) == MAX_PREVIOUSLY_ORDERED

    def test_previously_ordered_requires_order_history_instance(self):
        """AC4 — PreviouslyOrdered raises TypeError if not given an OrderHistory."""
        with pytest.raises(TypeError):
            PreviouslyOrdered({})  # type: ignore

        with pytest.raises(TypeError):
            PreviouslyOrdered(None)  # type: ignore
