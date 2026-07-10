"""
Miyota-8215 parts catalog and compatibility entries.

PARTS  — list[Part]: all Part definitions for the Miyota-8215 movement family.
COMPAT — dict[tuple[str, str], CompatibilityStatus]: compatibility entries
         keyed by (MovementFamily.MIYOTA_8215, part_id).

Consumed exclusively by part_compatibility.py (the public aggregator).
External consumers must import from src.catalog.data.part_compatibility.
"""

from ._types import CompatibilityStatus, PartCondition, PartType, MovementFamily, Part

# ---------------------------------------------------------------------------
# Miyota-8215 Part definitions
# ---------------------------------------------------------------------------

PARTS: list[Part] = [
    Part(
        id="ms-miyota-std",
        name="Miyota 8215 Mainspring (Standard)",
        part_type=PartType.MAINSPRING,
        movement_family=MovementFamily.MIYOTA_8215,
        condition=PartCondition.NEW,
        price=9.50,
        function_description=(
            "Provides the primary energy source for the Miyota 8215 automatic movement. "
            "The automatic rotor winds this spring during wear, making manual winding optional under normal use."
        ),
    ),
    Part(
        id="ms-miyota-strong",
        name="Miyota 8215 Mainspring (High-Torque)",
        part_type=PartType.MAINSPRING,
        movement_family=MovementFamily.MIYOTA_8215,
        condition=PartCondition.USED_GOOD,
        price=7.00,
        function_description=(
            "An upgraded mainspring for the Miyota 8215 that delivers improved power reserve. "
            "Used-Good condition; inspect for set (permanent deformation) before installation."
        ),
    ),
    Part(
        id="bw-miyota-std",
        name="Miyota 8215 Balance Wheel Assembly",
        part_type=PartType.BALANCE_WHEEL,
        movement_family=MovementFamily.MIYOTA_8215,
        condition=PartCondition.NEW,
        price=35.00,
        function_description=(
            "The frequency-defining oscillator for the Miyota 8215. "
            "Beats at 21,600 vph (vibrations per hour); replacing this assembly restores rate accuracy after shock damage."
        ),
    ),
    Part(
        id="ew-miyota-std",
        name="Miyota 8215 Escape Wheel",
        part_type=PartType.ESCAPE_WHEEL,
        movement_family=MovementFamily.MIYOTA_8215,
        condition=PartCondition.NEW,
        price=22.00,
        function_description=(
            "Converts rotational movement into the regulated impulses that drive the Miyota 8215 balance wheel. "
            "Worn or damaged teeth produce erratic timekeeping and must be replaced."
        ),
    ),
    Part(
        id="pf-miyota-std",
        name="Miyota 8215 Pallet Fork",
        part_type=PartType.PALLET_FORK,
        movement_family=MovementFamily.MIYOTA_8215,
        condition=PartCondition.USED_FAIR,
        price=14.00,
        function_description=(
            "Controls escape wheel release for the Miyota 8215. "
            "Used-Fair condition — expect some wear on pallet stone (jeweled contact face) surfaces; "
            "timing regulation accuracy may be slightly reduced."
        ),
    ),
    Part(
        id="cp-miyota-std",
        name="Miyota 8215 Cannon Pinion",
        part_type=PartType.CANNON_PINION,
        movement_family=MovementFamily.MIYOTA_8215,
        condition=PartCondition.NEW,
        price=6.00,
        function_description=(
            "Links the center wheel to the minute hand for the Miyota 8215. "
            "Must be press-fitted to correct tightness; too loose causes hand-slip, too tight prevents hand-setting."
        ),
    ),
    Part(
        id="stem-miyota-std",
        name="Miyota 8215 Winding Stem",
        part_type=PartType.STEM,
        movement_family=MovementFamily.MIYOTA_8215,
        condition=PartCondition.NEW,
        price=7.50,
        function_description=(
            "Transfers crown rotation into time-setting and (optionally) manual winding for the Miyota 8215. "
            "The stem must be fitted to the correct length for the case configuration; measure before ordering."
        ),
    ),
]

# ---------------------------------------------------------------------------
# Miyota-8215 compatibility entries
# Key: (MovementFamily.MIYOTA_8215, part_id) → CompatibilityStatus
# ---------------------------------------------------------------------------

COMPAT: dict[tuple[str, str], CompatibilityStatus] = {
    (MovementFamily.MIYOTA_8215, "ms-miyota-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "ms-miyota-strong"): CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "ms-eta2824-std"):   CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.MIYOTA_8215, "bw-miyota-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "bw-eta2824-std"):   CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.MIYOTA_8215, "ew-miyota-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "pf-miyota-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "stem-miyota-std"):  CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "cp-miyota-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "cw-universal"):     CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "cs-universal"):     CompatibilityStatus.COMPATIBLE,
}
