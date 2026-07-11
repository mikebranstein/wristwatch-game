"""
Validates the Python PARTS_CATALOG serialization against schema/catalog.schema.json.
"""

import json
from pathlib import Path

import pytest

try:
    from jsonschema import ValidationError, validate
except ImportError:  # pragma: no cover
    pytest.skip(
        "jsonschema is not installed. Add jsonschema>=4.17.0 to requirements-dev.txt.",
        allow_module_level=True,
    )

from catalog.data.part_compatibility import PARTS_CATALOG

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCHEMA_PATH = _REPO_ROOT / "schema" / "catalog.schema.json"


def _load_schema() -> dict:
    with _SCHEMA_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def _serialize_catalog() -> dict:
    movement_values = sorted(
        {part.movement_family.value for part in PARTS_CATALOG if part.movement_family is not None}
    )
    return {
        "movements": movement_values,
        "parts": [
            {
                "id": part.id,
                "name": part.name,
                "part_type": part.part_type.value,
                "movement_family": part.movement_family.value if part.movement_family else None,
                "condition": part.condition.value,
                "price": part.price,
                "function_description": part.function_description,
            }
            for part in PARTS_CATALOG
        ],
    }


def test_valid_catalog_passes_schema():
    validate(instance=_serialize_catalog(), schema=_load_schema())


def test_schema_file_declares_draft07():
    assert _load_schema().get("$schema") == "http://json-schema.org/draft-07/schema#"


def test_catalog_has_required_top_level_keys():
    catalog = _serialize_catalog()
    assert "movements" in catalog
    assert "parts" in catalog


def test_extra_fields_are_allowed():
    schema = _load_schema()
    catalog = _serialize_catalog()

    validate(instance={**catalog, "_debug_build": "test-extra-field"}, schema=schema)
    validate(
        instance={
            **catalog,
            "parts": [{**catalog["parts"][0], "_extra": "debug-value"}, *catalog["parts"][1:]],
        },
        schema=schema,
    )


def test_missing_movements_key_raises_validation_error():
    schema = _load_schema()
    catalog = _serialize_catalog()
    del catalog["movements"]

    with pytest.raises(ValidationError):
        validate(instance=catalog, schema=schema)


def test_missing_parts_key_raises_validation_error():
    schema = _load_schema()
    catalog = _serialize_catalog()
    del catalog["parts"]

    with pytest.raises(ValidationError):
        validate(instance=catalog, schema=schema)


def test_invalid_part_values_raise_validation_error():
    schema = _load_schema()
    catalog = _serialize_catalog()

    bad_condition = {
        **catalog,
        "parts": [{**catalog["parts"][0], "condition": "Refurbished"}, *catalog["parts"][1:]],
    }
    with pytest.raises(ValidationError):
        validate(instance=bad_condition, schema=schema)

    bad_price = {
        **catalog,
        "parts": [{**catalog["parts"][0], "price": -5.0}, *catalog["parts"][1:]],
    }
    with pytest.raises(ValidationError):
        validate(instance=bad_price, schema=schema)
