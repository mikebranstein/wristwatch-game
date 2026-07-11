"""
Tests for plain-language function descriptions — AC3

AC3: Each part detail panel includes a plain-language function description
     of 1–2 sentences. No unexplained technical terms appear without an
     accompanying inline tooltip or parenthetical definition.

Scenario 6 — Player views a part in search results → function description
             shown in detail panel → no unexplained jargon present.
"""

import re
import pytest
from catalog.data.part_compatibility import PARTS_CATALOG, PartType


class TestAC3PlainLanguageDescriptions:
    """AC3: Every part has a plain-language function description."""

    def test_every_part_has_a_function_description_field(self):
        """AC3 — every part in the catalog has a function_description field."""
        for part in PARTS_CATALOG:
            assert isinstance(part.function_description, str), \
                f"{part.id} missing function_description"
            assert len(part.function_description.strip()) > 0, \
                f"{part.id} has empty function_description"

    def test_all_descriptions_are_1_to_2_sentences(self):
        """AC3 — each description is 1–2 sentences (ends with period, max 2 sentence breaks)."""
        for part in PARTS_CATALOG:
            desc = part.function_description.strip()
            # Must end with a period
            assert desc.endswith("."), \
                f"{part.id}: description does not end with '.': {desc!r}"
            # Count sentence-ending splits: period followed by space+uppercase = new sentence
            sentences = re.split(r"\. (?=[A-Z])", desc)
            assert 1 <= len(sentences) <= 2, \
                f"{part.id}: expected 1-2 sentences, got {len(sentences)}: {desc!r}"

    def test_scenario6_all_search_results_carry_description_in_detail_panel(self):
        """AC3 (Scenario 6) — every part returned in search results has a description."""
        parts_with_desc = [
            p for p in PARTS_CATALOG
            if p.function_description and p.function_description.strip()
        ]
        assert len(parts_with_desc) == len(PARTS_CATALOG), \
            "Some parts are missing function descriptions"

    def test_amplitude_is_explained_inline_when_used(self):
        """AC3 — 'amplitude' (technical term) appears with an inline parenthetical explanation."""
        parts_with_amplitude = [
            p for p in PARTS_CATALOG
            if "amplitude" in p.function_description.lower()
        ]
        for part in parts_with_amplitude:
            # Must have a parenthetical explanation after "amplitude"
            assert re.search(r"amplitude[^.]*\([^)]+\)", part.function_description, re.IGNORECASE), \
                f"{part.id}: 'amplitude' used without inline parenthetical explanation"

    def test_pallet_stone_is_explained_inline_when_used(self):
        """AC3 — 'pallet stone' (technical term) appears with an inline parenthetical explanation."""
        parts_with_pallet_stone = [
            p for p in PARTS_CATALOG
            if "pallet stone" in p.function_description.lower()
        ]
        for part in parts_with_pallet_stone:
            assert re.search(r"pallet stone[^.]*\([^)]+\)", part.function_description, re.IGNORECASE), \
                f"{part.id}: 'pallet stone' used without inline parenthetical explanation"

    def test_vph_abbreviation_explained_when_used(self):
        """AC3 — 'vph' abbreviation is always accompanied by its expansion."""
        parts_with_vph = [
            p for p in PARTS_CATALOG
            if re.search(r"\bvph\b", p.function_description, re.IGNORECASE)
        ]
        for part in parts_with_vph:
            assert re.search(
                r"vibrations per hour|vph\s*\(vibrations per hour\)|\(.*?vph.*?\)",
                part.function_description,
                re.IGNORECASE,
            ), f"{part.id}: 'vph' used without expansion 'vibrations per hour'"

    def test_mainspring_descriptions_mention_energy_in_plain_terms(self):
        """AC3 — mainspring descriptions use plain terms for energy storage."""
        mainsprings = [p for p in PARTS_CATALOG if p.part_type == PartType.MAINSPRING]
        assert len(mainsprings) > 0, "No mainsprings in catalog"
        for part in mainsprings:
            assert re.search(
                r"energy|power|force|spring",
                part.function_description,
                re.IGNORECASE,
            ), f"{part.id}: mainspring description lacks plain-language energy terms"

    def test_balance_wheel_descriptions_explain_oscillating_role(self):
        """AC3 — balance wheel descriptions explain oscillating timekeeping role."""
        bws = [p for p in PARTS_CATALOG if p.part_type == PartType.BALANCE_WHEEL]
        assert len(bws) > 0, "No balance wheels in catalog"
        for part in bws:
            assert re.search(
                r"oscillat|swing|timekeeping|frequency",
                part.function_description,
                re.IGNORECASE,
            ), f"{part.id}: balance wheel description lacks timekeeping/oscillation terms"

    def test_cannon_pinion_descriptions_explain_hand_driving_role(self):
        """AC3 — cannon pinion descriptions mention the minute hand or hand-setting."""
        cps = [p for p in PARTS_CATALOG if p.part_type == PartType.CANNON_PINION]
        assert len(cps) > 0, "No cannon pinions in catalog"
        for part in cps:
            assert re.search(
                r"minute hand|hand|setting",
                part.function_description,
                re.IGNORECASE,
            ), f"{part.id}: cannon pinion description lacks hand reference"

    def test_all_descriptions_are_non_empty_strings_of_reasonable_length(self):
        """AC3 — all descriptions have meaningful content (> 40 chars, < 500 chars)."""
        for part in PARTS_CATALOG:
            desc = part.function_description.strip()
            assert len(desc) >= 40, \
                f"{part.id}: description too short ({len(desc)} chars): {desc!r}"
            assert len(desc) <= 500, \
                f"{part.id}: description too long ({len(desc)} chars) — trim to 1-2 sentences"
