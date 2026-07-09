"""
Part Compatibility Data Model
==============================
Maps (movement_family, part_id) pairs to a compatibility status.

CompatibilityStatus.UNCERTAIN is the correct default for any pair
that has no explicit entry — parts without a defined compatibility
entry render ~ Uncertain, NOT Incompatible (per design decision).

Initial scope covers three movement families:
  ETA-2824, AS-1950, Miyota-8215.
Additional families are added in follow-on content sprints.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class CompatibilityStatus(str, Enum):
    COMPATIBLE = "compatible"
    INCOMPATIBLE = "incompatible"
    UNCERTAIN = "uncertain"


class PartCondition(str, Enum):
    NEW = "New"
    USED_GOOD = "Used-Good"
    USED_FAIR = "Used-Fair"


class PartType(str, Enum):
    MAINSPRING = "mainspring"
    BALANCE_WHEEL = "balance-wheel"
    ESCAPE_WHEEL = "escape-wheel"
    PALLET_FORK = "pallet-fork"
    CANNON_PINION = "cannon-pinion"
    CROWN_WHEEL = "crown-wheel"
    CLICK_SPRING = "click-spring"
    JEWEL = "jewel"
    STEM = "stem"
    DIAL = "dial"
    CRYSTAL = "crystal"
    GASKET = "gasket"
    CORROSION_CLEANING_TOOL = "corrosion-cleaning-tool"
    DIAL_ENAMEL_REPAIR_TOOL = "dial-enamel-repair-tool"


class MovementFamily(str, Enum):
    ETA_2824 = "ETA-2824"
    AS_1950 = "AS-1950"
    MIYOTA_8215 = "Miyota-8215"


@dataclass(frozen=True)
class Part:
    id: str
    name: str
    part_type: PartType
    movement_family: Optional[MovementFamily]  # None = universal
    condition: PartCondition
    price: float
    function_description: str


# ---------------------------------------------------------------------------
# Static compatibility table
# Key: (movement_family, part_id)
# Value: CompatibilityStatus
# Parts not listed default to UNCERTAIN.
# ---------------------------------------------------------------------------

COMPATIBILITY_TABLE: dict[tuple[str, str], CompatibilityStatus] = {
    # ETA-2824
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

    # AS-1950
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

    # Miyota-8215
    (MovementFamily.MIYOTA_8215, "ms-miyota-std"):   CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "ms-miyota-strong"): CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "ms-eta2824-std"):  CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.MIYOTA_8215, "bw-miyota-std"):   CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "bw-eta2824-std"):  CompatibilityStatus.INCOMPATIBLE,
    (MovementFamily.MIYOTA_8215, "ew-miyota-std"):   CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "pf-miyota-std"):   CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "stem-miyota-std"): CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "cp-miyota-std"):   CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "cw-universal"):    CompatibilityStatus.COMPATIBLE,
    (MovementFamily.MIYOTA_8215, "cs-universal"):    CompatibilityStatus.COMPATIBLE,
}


# ---------------------------------------------------------------------------
# Parts catalog data — initial scope for first 3 movement families
# ---------------------------------------------------------------------------

PARTS_CATALOG: list[Part] = [
    # ---- ETA-2824 mainsprings ----
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
    # ---- Balance wheels ----
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
    # ---- Escape wheels ----
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
    # ---- Pallet forks ----
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
    # ---- Cannon pinions ----
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
    # ---- Universal parts ----
    Part(
        id="cw-universal",
        name="Crown Wheel (Universal Small)",
        part_type=PartType.CROWN_WHEEL,
        movement_family=None,
        condition=PartCondition.NEW,
        price=5.00,
        function_description=(
            "Engages the winding stem to transmit manual winding force into the barrel. "
            "The crown wheel's teeth interlock with the ratchet wheel to wind the mainspring one click at a time."
        ),
    ),
    Part(
        id="cs-universal",
        name="Click Spring (Universal)",
        part_type=PartType.CLICK_SPRING,
        movement_family=None,
        condition=PartCondition.NEW,
        price=3.50,
        function_description=(
            "A small tensioned spring that holds the ratchet wheel in position between winding clicks. "
            "Without a functioning click spring, the mainspring can unwind uncontrolled when tension is applied."
        ),
    ),
    # ---- Stems ----
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
    # ---- Damage-state repair parts (Phase 1) ----
    # Water Ingress repair path
    Part(
        id="corrosion-cleaning-tool",
        name="Corrosion Cleaning Tool",
        part_type=PartType.CORROSION_CLEANING_TOOL,
        movement_family=None,
        condition=PartCondition.NEW,
        price=14.00,
        function_description=(
            "Consumable cleaning compound and applicator for removing blue-green verdigris corrosion from brass "
            "movement plates and bridges. "
            "Used exclusively during Water Ingress damage-state repairs; does not appear in standard repair jobs."
        ),
    ),
    Part(
        id="gasket-universal",
        name="Crown Gasket (Universal)",
        part_type=PartType.GASKET,
        movement_family=None,
        condition=PartCondition.NEW,
        price=4.50,
        function_description=(
            "Rubber O-ring gasket that seals the crown tube against moisture ingress. "
            "Required replacement whenever a Water Ingress damage state is repaired — "
            "the failed gasket is the primary point of entry."
        ),
    ),
    Part(
        id="crystal-defogging-solution",
        name="Crystal Defogging Solution",
        part_type=PartType.CRYSTAL,
        movement_family=None,
        condition=PartCondition.NEW,
        price=6.00,
        function_description=(
            "Solvent solution that removes moisture condensation fog from the inner face of the watch crystal. "
            "Applied as the final step of the Water Ingress repair path, after corrosion cleaning and crown replacement."
        ),
    ),
    # Oxidation / Tarnish repair path
    Part(
        id="case-polish-compound",
        name="Case Polishing Compound",
        part_type=PartType.DIAL,
        movement_family=None,
        condition=PartCondition.NEW,
        price=8.00,
        function_description=(
            "Abrasive polishing compound for restoring tarnished and oxidised case metal surfaces. "
            "Used in the Oxidation/Tarnish damage-state repair path to remove deep patination before reassembly."
        ),
    ),
    Part(
        id="dial-restoration-kit",
        name="Dial Restoration Kit",
        part_type=PartType.DIAL,
        movement_family=None,
        condition=PartCondition.NEW,
        price=18.00,
        function_description=(
            "Professional kit for cleaning and restoring badly oxidised dial surfaces with brown-black patination. "
            "Part of the Oxidation/Tarnish damage-state repair path; restores dial legibility without refinishing."
        ),
    ),
    # Crystal Crazing repair path
    Part(
        id="crystal-mineral-universal",
        name="Mineral Crystal (Universal Flat)",
        part_type=PartType.CRYSTAL,
        movement_family=None,
        condition=PartCondition.NEW,
        price=12.00,
        function_description=(
            "Flat mineral glass crystal for replacing shattered or crazed watch crystals. "
            "Universal sizing accommodates standard case diameters; required for Crystal Crazing damage-state repairs."
        ),
    ),
    Part(
        id="dial-enamel-repair-tool",
        name="Dial Enamel Repair Tool",
        part_type=PartType.DIAL_ENAMEL_REPAIR_TOOL,
        movement_family=None,
        condition=PartCondition.NEW,
        price=22.00,
        function_description=(
            "Precision applicator and filler compound for repairing hairline fractures in dial enamel surfaces. "
            "Used in the Crystal Crazing damage-state repair path after crystal replacement to restore dial integrity."
        ),
    ),
]
