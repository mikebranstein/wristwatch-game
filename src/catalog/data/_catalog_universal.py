"""
Universal and damage-state repair parts catalog.

PARTS — list[Part]: all Part definitions with movement_family=None.
        Includes:
          - universal mechanical parts (crown wheel, click spring)
          - damage-state repair consumables (Water Ingress, Oxidation/Tarnish,
            Crystal Crazing repair paths)

No COMPAT fragment: universal parts appear in the compatibility entries of
each family module (cw-universal and cs-universal are listed there), so no
additional per-universal compat dict is needed.

Consumed exclusively by part_compatibility.py (the public aggregator).
External consumers must import from src.catalog.data.part_compatibility.
"""

from ._types import PartCondition, PartType, Part

# ---------------------------------------------------------------------------
# Universal mechanical parts
# ---------------------------------------------------------------------------

PARTS: list[Part] = [
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
