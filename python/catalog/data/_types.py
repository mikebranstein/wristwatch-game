"""
Shared type definitions for the catalog data layer.

Extracted from part_compatibility.py so that per-family sub-modules can
import types without creating circular dependencies.

Public names re-exported via part_compatibility.py — external consumers
should continue to import from catalog.data.part_compatibility, not
directly from this module.
"""

from dataclasses import dataclass
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
