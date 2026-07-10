"""
AS-1950 parts catalog and compatibility entries.

PARTS  — list[Part]: all Part definitions for the AS-1950 movement family.
COMPAT — dict[tuple[str, str], CompatibilityStatus]: compatibility entries
         keyed by (MovementFamily.AS_1950, part_id).

Consumed exclusively by part_compatibility.py (the public aggregator).
External consumers must import from src.catalog.data.part_compatibility.
"""

from ._types import CompatibilityStatus, PartCondition, PartType, MovementFamily, Part

# ---------------------------------------------------------------------------
# AS-1950 Part definitions
# ---------------------------------------------------------------------------

PARTS: list[Part] = [
    Part(
        id="ms-as1950-std",
        name="AS 1950 Mainspring (Standard)",
        part_type=PartType.MAINSPRING,
        movement_family=MovementFamily.AS_1950,
        condition=PartCondition.NEW,
        price=11.00,
        function_description=(
            "Stores and releases mechanical energy to power the AS 1950 movement. "
            "Sized specifically for the AS 1950 barrel dimensions; do not substitute with ETA-spec springs."
        ),
    ),
    Part(
        id="bw-as1950-std",
        name="AS 1950 Balance Wheel Assembly",
        part_type=PartType.BALANCE_WHEEL,
        movement_family=MovementFamily.AS_1950,
        condition=PartCondition.NEW,
        price=40.00,
        function_description=(
            "The oscillating regulator for the AS 1950 movement. "
            "The balance wheel and its hairspring work together to keep consistent beat frequency for accurate timekeeping."
        ),
    ),
    Part(
        id="ew-as1950-std",
        name="AS 1950 Escape Wheel",
        part_type=PartType.ESCAPE_WHEEL,
        movement_family=MovementFamily.AS_1950,
        condition=PartCondition.USED_GOOD,
        price=19.00,
        function_description=(
            "Regulates power transmission to the escapement of the AS 1950. "
            "Used-Good condition; verify tooth geometry under magnification before installation."
        ),
    ),
    Part(
        id="pf-as1950-std",
        name="AS 1950 Pallet Fork",
        part_type=PartType.PALLET_FORK,
        movement_family=MovementFamily.AS_1950,
        condition=PartCondition.NEW,
        price=29.00,
        function_description=(
            "Governs the escapement action in the AS 1950. "
            "A worn or chipped pallet stone (the jeweled contact face) causes the movement to gain "
            "or lose time and must be replaced to restore regulation."
        ),
    ),
    Part(
        id="cp-as1950-std",
        name="AS 1950 Cannon Pinion",
        part_type=PartType.CANNON_PINION,
        movement_family=MovementFamily.AS_1950,
        condition=PartCondition.NEW,
        price=7.50,
        function_description=(
            "Drives the minute hand of the AS 1950 and provides slip-fit hand-setting capability. "
            "A loose cannon pinion causes hands to slip under normal movement; replace if friction is insufficient."
        ),
    ),
    Part(
        id="stem-as1950-std",
        name="AS 1950 Winding Stem",
        part_type=PartType.STEM,
        movement_family=MovementFamily.AS_1950,
        condition=PartCondition.NEW,
        price=8.50,
        function_description=(
            "Bridges the external crown and the internal winding/setting train for the AS 1950. "
            "Length and thread pitch are caliber-specific; do not substitute with stems from other calibers."
        ),
    ),
]

# ---------------------------------------------------------------------------
# AS-1950 compatibility entries
# Key: (MovementFamily.AS_1950, part_id) → CompatibilityStatus
# ---------------------------------------------------------------------------

COMPAT: dict[tuple[str, str], CompatibilityStatus] = {
    (MovementFamily.AS_1950, "ms-as1950-std"):     CompatibilityStatus.COMPATIBLE,
    (MovementFamily.AS_1950, "ms-eta2824-std"):    CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.AS_1950, "bw-as1950-std"):     CompatibilityStatus.COMPATIBLE,
    (MovementFamily.AS_1950, "bw-eta2824-std"):    CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.AS_1950, "ew-as1950-std"):     CompatibilityStatus.COMPATIBLE,
    (MovementFamily.AS_1950, "pf-as1950-std"):     CompatibilityStatus.COMPATIBLE,
    (MovementFamily.AS_1950, "stem-as1950-std"):   CompatibilityStatus.COMPATIBLE,
    (MovementFamily.AS_1950, "cp-as1950-std"):     CompatibilityStatus.COMPATIBLE,
    (MovementFamily.AS_1950, "cw-universal"):      CompatibilityStatus.COMPATIBLE,
    (MovementFamily.AS_1950, "cs-universal"):      CompatibilityStatus.COMPATIBLE,
}
