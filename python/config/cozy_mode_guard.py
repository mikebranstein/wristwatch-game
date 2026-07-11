"""
CozymodeGuard — Issue #151: Workshop Economy Expanded (AC5)
============================================================

Centralized Cozy Mode enforcement utility for all four Workshop Economy
Expanded sub-systems (reputation, parts sourcing, upgrade tree, analytics).

AC5 requirement (verbatim from clarified acceptance criteria):
  "Cozy Mode enforcement must use a single centralized check (not per-sub-system)
  to guarantee consistent suppression across all four new sub-systems."

This module provides that single centralized check. All four sub-systems accept
a ``cozy_mode: bool`` parameter at mutation call sites; callers obtain that flag
exclusively from ``CozymodeGuard.is_active(game_state)`` rather than reading
separate sub-system flags. This pattern:
  - Prevents drift between sub-systems
  - Makes AC5 testable at a single point
  - Mirrors the existing save-state pattern (flag lives in top-level game_state dict)

Usage::

    guard = CozymodeGuard()
    is_cozy = guard.is_active(game_state)

    # Pass to any sub-system that accepts cozy_mode:
    reputation_system.record_job_outcome(score, cozy_mode=is_cozy)
    roster.available_clients(cozy_mode=is_cozy)
    tree.purchase(upgrade_id, cozy_mode=is_cozy)
    # (analytics has no cozy-mode effect — read-only computation)
"""

from __future__ import annotations

COZY_MODE_KEY: str = "cozy_mode"   # top-level save-dict key for the setting


class CozymodeGuard:
    """
    Centralized Cozy Mode check for Workshop Economy Expanded sub-systems.

    Reads the ``cozy_mode`` flag from the game state dict (same dict used by
    SaveSystem._atomic_write). Returns False safely when the key is absent
    (pre-feature saves and first-run states).
    """

    def is_active(self, game_state: dict | None) -> bool:
        """
        Return True when Cozy Mode is currently enabled.

        Parameters
        ----------
        game_state : dict | None
            The current game state dict. None is treated as Cozy Mode off.

        Returns
        -------
        bool
        """
        return bool((game_state or {}).get(COZY_MODE_KEY, False))

    def set_active(self, game_state: dict, enabled: bool) -> dict:
        """
        Return an updated game state dict with cozy_mode set to *enabled*.

        Does not mutate *game_state* in place — returns a new dict.

        Parameters
        ----------
        game_state : dict
        enabled : bool

        Returns
        -------
        dict
            Updated game state with cozy_mode stamped in.
        """
        return {**game_state, COZY_MODE_KEY: bool(enabled)}
