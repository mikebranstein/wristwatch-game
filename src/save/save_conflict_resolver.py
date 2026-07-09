"""
SaveConflictResolver — conflict UI state machine
================================================

Detects a save conflict at load time, builds the conflict screen state for the
UI layer, and gates any overwrite on explicit player confirmation (Issue #82 — AC4).

State machine
-------------
    IDLE
      ↓ detect_conflict_at_load()
    CONFLICT_DETECTED          — conflict screen shown; awaiting player choice
      ↓ player_selects('local') or player_selects('cloud')
    AWAITING_CONFIRMATION      — confirmation prompt shown ("Are you sure?")
      ↓ player_confirms()
    RESOLVED                   — chosen save loaded; other save untouched
      ↓ player_cancels() (from AWAITING_CONFIRMATION)
    CONFLICT_DETECTED          — returns to choice screen

No overwrite occurs until the player has:
  1. Selected a save option
  2. Explicitly confirmed the selection

This prevents AC4's "silent/automatic overwrite" prohibition.

Issue #82 — AC4, Test Scenario 7, Test Scenario 8.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# State constants
# ---------------------------------------------------------------------------

class RESOLVER_STATE:
    IDLE                   = "IDLE"
    CONFLICT_DETECTED      = "CONFLICT_DETECTED"
    AWAITING_CONFIRMATION  = "AWAITING_CONFIRMATION"
    RESOLVED               = "RESOLVED"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ConflictScreenState:
    """
    UI-ready state describing both save options presented during conflict resolution.
    """
    local_timestamp_display:  str
    cloud_timestamp_display:  str
    local_last_stage:         Optional[str]
    cloud_last_stage:         Optional[str]
    selected_option:          Optional[str]          # 'local' | 'cloud' | None
    awaiting_confirmation:    bool
    resolver_state:           str                     # RESOLVER_STATE constant
    instructions:             str = field(init=False)

    def __post_init__(self) -> None:
        self.instructions = (
            "Two saves were found. Select which save to load. "
            "Your explicit confirmation is required before anything is overwritten."
        )


# ---------------------------------------------------------------------------
# SaveConflictResolver
# ---------------------------------------------------------------------------

class SaveConflictResolver:
    """
    Conflict UI state machine for Save/Load Reliability System (Issue #82).

    Parameters
    ----------
    cloud_sync_manager : CloudSyncManager
        Injected CloudSyncManager instance for conflict detection.
    """

    def __init__(self, cloud_sync_manager) -> None:
        self._cloud = cloud_sync_manager
        self._state: str = RESOLVER_STATE.IDLE

        # Conflict data populated during detect phase.
        self._local_save_data:   Optional[dict]  = None
        self._cloud_save_data:   Optional[dict]  = None
        self._local_timestamp:   Optional[float] = None
        self._cloud_timestamp:   Optional[float] = None
        self._selected_option:   Optional[str]   = None  # 'local' | 'cloud'
        self._confirmed:         bool             = False

    # -----------------------------------------------------------------------
    # Phase 1: Detect conflict at load time
    # -----------------------------------------------------------------------

    def detect_conflict_at_load(
        self,
        local_save_data: dict,
        local_timestamp: Optional[float] = None,
    ) -> bool:
        """
        Check for a conflict between *local_save_data* and the cloud save.

        Returns True when a conflict is detected (caller should show conflict UI).
        Transitions state to CONFLICT_DETECTED when True, stays IDLE when False.

        Parameters
        ----------
        local_save_data : dict
        local_timestamp : float | None
            Epoch seconds of the local save file.

        Returns
        -------
        bool
            True ↔ conflict exists.
        """
        from src.save.cloud_sync_manager import ConflictInfo

        conflict: ConflictInfo = self._cloud.detect_conflict(
            local_save_data, local_timestamp
        )

        if not conflict.has_conflict:
            self._state = RESOLVER_STATE.IDLE
            return False

        # Retrieve the cloud save data for display.
        cloud_data, cloud_ts = self._cloud.pull_save()

        self._local_save_data  = local_save_data
        self._cloud_save_data  = cloud_data or {}
        self._local_timestamp  = local_timestamp
        self._cloud_timestamp  = cloud_ts
        self._selected_option  = None
        self._confirmed        = False
        self._state            = RESOLVER_STATE.CONFLICT_DETECTED
        return True

    # -----------------------------------------------------------------------
    # Phase 2: Build UI state for conflict screen
    # -----------------------------------------------------------------------

    def build_conflict_screen_state(self) -> ConflictScreenState:
        """
        Return a UI-ready ConflictScreenState for rendering the conflict screen.

        Raises RuntimeError when called outside CONFLICT_DETECTED or
        AWAITING_CONFIRMATION states.
        """
        if self._state not in (
            RESOLVER_STATE.CONFLICT_DETECTED,
            RESOLVER_STATE.AWAITING_CONFIRMATION,
        ):
            raise RuntimeError(
                f"build_conflict_screen_state() called in invalid state: {self._state}. "
                "Must be in CONFLICT_DETECTED or AWAITING_CONFIRMATION."
            )

        from src.save.cloud_sync_manager import SaveMetadata

        local_meta = SaveMetadata(
            timestamp=self._local_timestamp,
            last_known_stage=(self._local_save_data or {}).get("last_checkpoint_stage"),
            source="local",
        )
        cloud_meta = SaveMetadata(
            timestamp=self._cloud_timestamp,
            last_known_stage=(self._cloud_save_data or {}).get("last_checkpoint_stage"),
            source="cloud",
        )

        return ConflictScreenState(
            local_timestamp_display=local_meta.timestamp_display,
            cloud_timestamp_display=cloud_meta.timestamp_display,
            local_last_stage=local_meta.last_known_stage,
            cloud_last_stage=cloud_meta.last_known_stage,
            selected_option=self._selected_option,
            awaiting_confirmation=self._state == RESOLVER_STATE.AWAITING_CONFIRMATION,
            resolver_state=self._state,
        )

    # -----------------------------------------------------------------------
    # Phase 3: Player selects a save option
    # -----------------------------------------------------------------------

    def player_selects(self, option: str) -> None:
        """
        Record the player's choice ('local' or 'cloud') and transition to
        AWAITING_CONFIRMATION.

        AC4: no write occurs here — only the confirmation in player_confirms()
        triggers the actual save load.

        Parameters
        ----------
        option : str
            'local' or 'cloud'.

        Raises
        ------
        ValueError
            When *option* is not 'local' or 'cloud'.
        RuntimeError
            When called outside CONFLICT_DETECTED state.
        """
        if self._state != RESOLVER_STATE.CONFLICT_DETECTED:
            raise RuntimeError(
                f"player_selects() called in invalid state: {self._state}. "
                "Must be in CONFLICT_DETECTED."
            )
        if option not in ("local", "cloud"):
            raise ValueError(f"option must be 'local' or 'cloud', got '{option}'")

        self._selected_option = option
        self._state = RESOLVER_STATE.AWAITING_CONFIRMATION

    # -----------------------------------------------------------------------
    # Phase 4a: Player confirms — overwrite gate (AC4 critical)
    # -----------------------------------------------------------------------

    def player_confirms(self) -> dict:
        """
        Complete conflict resolution: return the player-selected save data.

        This is the **only** point at which a save decision is finalised.
        No overwrite can happen before this call.  AC4 invariant: silent
        overwrite is structurally impossible — selection + confirmation are
        required in sequence before any data is returned to the load path.

        Returns
        -------
        dict
            The save data the player chose to load.

        Raises
        ------
        RuntimeError
            When called outside AWAITING_CONFIRMATION state or before a
            selection has been made.
        """
        if self._state != RESOLVER_STATE.AWAITING_CONFIRMATION:
            raise RuntimeError(
                f"player_confirms() called in invalid state: {self._state}. "
                "Must be in AWAITING_CONFIRMATION."
            )
        if self._selected_option is None:
            raise RuntimeError("player_confirms() called with no selection.")

        self._confirmed = True
        self._state = RESOLVER_STATE.RESOLVED

        if self._selected_option == "local":
            return dict(self._local_save_data or {})
        else:
            return dict(self._cloud_save_data or {})

    # -----------------------------------------------------------------------
    # Phase 4b: Player cancels — returns to choice screen
    # -----------------------------------------------------------------------

    def player_cancels(self) -> None:
        """
        Cancel the current selection and return to CONFLICT_DETECTED state.
        The player is shown the conflict screen again without any write occurring.
        """
        if self._state != RESOLVER_STATE.AWAITING_CONFIRMATION:
            raise RuntimeError(
                f"player_cancels() called in invalid state: {self._state}. "
                "Must be in AWAITING_CONFIRMATION."
            )
        self._selected_option = None
        self._state = RESOLVER_STATE.CONFLICT_DETECTED

    # -----------------------------------------------------------------------
    # Accessors
    # -----------------------------------------------------------------------

    @property
    def state(self) -> str:
        """Current state machine state (one of RESOLVER_STATE constants)."""
        return self._state

    @property
    def is_confirmed(self) -> bool:
        """True only after player_confirms() has been called successfully."""
        return self._confirmed
