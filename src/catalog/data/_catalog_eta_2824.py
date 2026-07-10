"""
ETA-2824 parts catalog and compatibility entries.

PARTS  — list[Part]: all Part definitions for the ETA-2824 movement family.
COMPAT — dict[tuple[str, str], CompatibilityStatus]: compatibility entries
         keyed by (MovementFamily.ETA_2824, part_id).

Consumed exclusively by part_compatibility.py (the public aggregator).
External consumers must import from src.catalog.data.part_compatibility.
"""

from ._types import CompatibilityStatus, PartCondition, PartType, MovementFamily, Part

# ---------------------------------------------------------------------------
# ETA-2824 Part definitions
# ---------------------------------------------------------------------------

PARTS: list[Part] = [
    Part(
        id="ms-eta2824-std",
        name="ETA 2824 Mainspring (Standard)",
        part_type=PartType.MAINSPRING,
        movement_family=MovementFamily.ETA_2824,
        condition=PartCondition.NEW,
        price=12.50,
        function_description=(
            "Stores and releases mechanical energy to power the movement. "
            "The coiled spring unwinds slowly, delivering a consistent force through the gear train to drive timekeeping."
        ),
    ),
    Part(
        id="ms-eta2824-strong",
        name="ETA 2824 Mainspring (High-Torque)",
        part_type=PartType.MAINSPRING,
        movement_family=MovementFamily.ETA_2824,
        condition=PartCondition.NEW,
        price=18.00,
        function_description=(
            "A higher-tension mainspring that extends power reserve and improves amplitude "
            "(the arc of the balance wheel's oscillation). "
            "Use when the standard spring provides insufficient power reserve for the desired movement behavior."
        ),
    ),
    Part(
        id="bw-eta2824-std",
        name="ETA 2824 Balance Wheel Assembly",
        part_type=PartType.BALANCE_WHEEL,
        movement_family=MovementFamily.ETA_2824,
        condition=PartCondition.NEW,
        price=45.00,
        function_description=(
            "The oscillating timekeeping element of the movement — the balance wheel swings back and forth "
            "at a precise frequency (typically 28,800 vibrations per hour) to divide time into equal segments."
        ),
    ),
    Part(
        id="ew-eta2824-std",
        name="ETA 2824 Escape Wheel",
        part_type=PartType.ESCAPE_WHEEL,
        movement_family=MovementFamily.ETA_2824,
        condition=PartCondition.NEW,
        price=28.00,
        function_description=(
            "The final wheel in the gear train before the escapement. "
            "Its specially shaped teeth are caught and released by the pallet fork, "
            "converting continuous rotational energy into the regulated tick-tock of the movement."
        ),
    ),
    Part(
        id="pf-eta2824-std",
        name="ETA 2824 Pallet Fork",
        part_type=PartType.PALLET_FORK,
        movement_family=MovementFamily.ETA_2824,
        condition=PartCondition.NEW,
        price=32.00,
        function_description=(
            "The lever that alternately locks and releases the escape wheel teeth. "
            "Its two pallet stones (jewels set at precise angles) catch each tooth to divide energy into equal "
            "impulses delivered to the balance wheel."
        ),
    ),
    Part(
        id="cp-eta2824-std",
        name="ETA 2824 Cannon Pinion",
        part_type=PartType.CANNON_PINION,
        movement_family=MovementFamily.ETA_2824,
        condition=PartCondition.NEW,
        price=8.00,
        function_description=(
            "Transmits rotational motion from the center wheel to the minute hand. "
            "Its friction-fit design allows the hands to be set without disengaging the gear train."
        ),
    ),
    Part(
        id="stem-eta2824-std",
        name="ETA 2824 Winding Stem",
        part_type=PartType.STEM,
        movement_family=MovementFamily.ETA_2824,
        condition=PartCondition.NEW,
        price=9.00,
        function_description=(
            "Connects the crown (the knob on the watch case) to the setting and winding mechanism inside the movement. "
            "A bent or broken stem prevents winding and hand-setting; replace before reassembly."
        ),
    ),
]

# ---------------------------------------------------------------------------
# ETA-2824 compatibility entries
# Key: (MovementFamily.ETA_2824, part_id) → CompatibilityStatus
# ---------------------------------------------------------------------------

COMPAT: dict[tuple[str, str], CompatibilityStatus] = {
    (MovementFamily.ETA_2824, "ms-eta2824-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.ETA_2824, "ms-eta2824-strong"): CompatibilityStatus.COMPATIBLE,
    (MovementFamily.ETA_2824, "ms-as1950-std"):     CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.ETA_2824, "bw-eta2824-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.ETA_2824, "bw-miyota-std"):     CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.ETA_2824, "ew-eta2824-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.ETA_2824, "pf-eta2824-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.ETA_2824, "pf-miyota-std"):     CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.ETA_2824, "cp-eta2824-std"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.ETA_2824, "stem-eta2824-std"):  CompatibilityStatus.COMPATIBLE,
    (MovementFamily.ETA_2824, "cw-universal"):      CompatibilityStatus.COMPATIBLE,
    (MovementFamily.ETA_2824, "cs-universal"):      CompatibilityStatus.COMPATIBLE,
}
