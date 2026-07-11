"""
NotificationService – session-start and in-game notification surfaces
=====================================================================

build_parts_arrived_notification(arrived_orders)
    Consumes the list of orders that resolved since the last session and returns
    a structured notification dict for the "Parts Arrived" UI panel.
    Returns None when nothing arrived so the caller never renders a spurious notice.

build_missing_part_prompt(in_transit_parts)
    Called when a player tries to advance to installation but a required part is
    still In-Transit.  Returns a non-blocking informational prompt (not an error
    state) describing the awaited part(s) and their ETA.

build_autosave_notification(stage)          [Issue #82 — AC2]
    Returns a brief "Auto-saved ✓" notification for the completed *stage*.
    Non-blocking; must be displayed for 2–3 s then dismissed automatically.

build_manual_save_notification()            [Issue #82 — AC2]
    Returns a brief "Saved ✓" notification for a player-initiated manual save.

build_save_failed_notification(error_msg)  [Issue #82 — AC3]
    Returns an actionable "Save failed" error notification surfaced within 5 s of
    the failure.  Includes a human-readable reason so the player can take action
    (e.g. "disk full — free space and retry").
"""

from __future__ import annotations
from typing import Optional

from orders.order import Order

# ---------------------------------------------------------------------------
# Notification type constants (Issue #82 — AC2, AC3)
# ---------------------------------------------------------------------------

AUTOSAVE_CONFIRMED   = "AUTOSAVE_CONFIRMED"
MANUAL_SAVE_CONFIRMED = "MANUAL_SAVE_CONFIRMED"
SAVE_FAILED          = "SAVE_FAILED"


class NotificationService:

    def build_parts_arrived_notification(
        self, arrived_orders: Optional[list[Order]]
    ) -> Optional[dict]:
        """
        Build the "Parts Arrived" session-start notification (AC3).

        Returns None when no orders arrived — prevents spurious notifications (Scenario 6).
        """
        if not arrived_orders:
            return None

        return {
            "type": "PARTS_ARRIVED",
            "title": "Parts Arrived!",
            "items": [
                {
                    "order_id": o.id,
                    "part_name": o.part_name,
                    "job_id": o.job_id,
                    "supplier_tier_name": o.supplier_tier_name,
                    "cost": o.cost,
                }
                for o in arrived_orders
            ],
        }

    def build_missing_part_prompt(self, in_transit_parts: list[Order]) -> dict:
        """
        Build a non-blocking informational prompt for the installation gate (AC5).

        Raises ValueError when called with an empty list.
        """
        if not in_transit_parts:
            raise ValueError("build_missing_part_prompt requires at least one in-transit part")

        awaited_parts = [
            {
                "part_name": o.part_name,
                "supplier_tier_name": o.supplier_tier_name,
                "estimated_arrival_session": o.estimated_arrival_session,
                "order_id": o.id,
            }
            for o in in_transit_parts
        ]

        part_names = ", ".join(f'"{p["part_name"]}"' for p in awaited_parts)
        plurality = "it is" if len(in_transit_parts) == 1 else "they are"

        message = (
            f"You cannot install {part_names} yet — {plurality} still on the way. "
            "Return next session to continue, or use the Order Dashboard to expedite."
        )

        return {
            "type": "MISSING_PART_INFO",
            "title": "Parts Still In Transit",
            "message": message,
            "awaited_parts": awaited_parts,
        }

    # -----------------------------------------------------------------------
    # Save confirmation / failure notifications (Issue #82 — AC2, AC3)
    # -----------------------------------------------------------------------

    def build_autosave_notification(self, stage: str) -> dict:
        """
        Build the "Auto-saved ✓" notification fired after a stage-checkpoint autosave.

        AC2: notification must appear within 1 s of save completion, persist 2–3 s,
        and dismiss without player interaction.  The ``display_duration_ms`` field
        encodes the intended display window for the UI layer.

        Parameters
        ----------
        stage : str
            The restoration stage that just completed (e.g. 'teardown', 'cleaning').

        Returns
        -------
        dict
            Structured notification ready for the UI renderer.
        """
        stage_label = stage.capitalize() if stage else "Stage"
        return {
            "type": AUTOSAVE_CONFIRMED,
            "title": "Auto-saved ✓",
            "message": f"{stage_label} complete — progress saved automatically.",
            "stage": stage,
            "display_duration_ms": 2500,
            "blocking": False,
        }

    def build_manual_save_notification(self) -> dict:
        """
        Build the "Saved ✓" notification for a player-initiated manual save (AC2).

        Distinct from the autosave variant so the player can distinguish the two events.
        """
        return {
            "type": MANUAL_SAVE_CONFIRMED,
            "title": "Saved ✓",
            "message": "Your progress has been saved.",
            "display_duration_ms": 2500,
            "blocking": False,
        }

    def build_save_failed_notification(self, error_message: str = "") -> dict:
        """
        Build the actionable "Save failed" error notification (AC3).

        The failed save must not overwrite any existing valid save file; this
        notification surfaces the failure state within 5 s so the player can act.

        Parameters
        ----------
        error_message : str
            Human-readable description of the failure (e.g. "Disk full — free space
            and retry", "Cloud write error — check your connection").

        Returns
        -------
        dict
            Structured error notification ready for the UI renderer.
        """
        base_message = "Save failed — your progress was not saved."
        if error_message:
            detail = f" {error_message}"
        else:
            detail = " Check available disk space and try again."

        return {
            "type": SAVE_FAILED,
            "title": "Save Failed",
            "message": base_message + detail,
            "error_detail": error_message,
            "display_duration_ms": 5000,
            "blocking": False,
            "actionable": True,
        }

    def build_parts_arrived_notification(
        self, arrived_orders: Optional[list[Order]]
    ) -> Optional[dict]:
        """
        Build the "Parts Arrived" session-start notification (AC3).

        Returns None when no orders arrived — prevents spurious notifications (Scenario 6).
        """
        if not arrived_orders:
            return None

        return {
            "type": "PARTS_ARRIVED",
            "title": "Parts Arrived!",
            "items": [
                {
                    "order_id": o.id,
                    "part_name": o.part_name,
                    "job_id": o.job_id,
                    "supplier_tier_name": o.supplier_tier_name,
                    "cost": o.cost,
                }
                for o in arrived_orders
            ],
        }

    def build_missing_part_prompt(self, in_transit_parts: list[Order]) -> dict:
        """
        Build a non-blocking informational prompt for the installation gate (AC5).

        Raises ValueError when called with an empty list.
        """
        if not in_transit_parts:
            raise ValueError("build_missing_part_prompt requires at least one in-transit part")

        awaited_parts = [
            {
                "part_name": o.part_name,
                "supplier_tier_name": o.supplier_tier_name,
                "estimated_arrival_session": o.estimated_arrival_session,
                "order_id": o.id,
            }
            for o in in_transit_parts
        ]

        part_names = ", ".join(f'"{p["part_name"]}"' for p in awaited_parts)
        plurality = "it is" if len(in_transit_parts) == 1 else "they are"

        message = (
            f"You cannot install {part_names} yet — {plurality} still on the way. "
            "Return next session to continue, or use the Order Dashboard to expedite."
        )

        return {
            "type": "MISSING_PART_INFO",
            "title": "Parts Still In Transit",
            "message": message,
            "awaited_parts": awaited_parts,
        }
