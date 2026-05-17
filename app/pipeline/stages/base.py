"""Abstract BaseStage for all pipeline stages."""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from loguru import logger

from app.state import AgentState, AgentTurn, WorkerFailure


class BaseStage(ABC):
    name: str = "base"

    async def __call__(self, state: AgentState) -> AgentState:
        start = time.monotonic()
        logger.info("━━━ Stage: {} ━━━", self.name)
        try:
            new_state = await self.run(state)
            duration_ms = (time.monotonic() - start) * 1000
            new_state.record_turn(AgentTurn(
                agent_name=self.name,
                action=f"run_{self.name}",
                result="success",
                duration_ms=round(duration_ms, 1),
                success=True,
            ))
            logger.info("  ✅ {} done in {:.0f}ms", self.name, duration_ms)
            return new_state
        except Exception as exc:
            duration_ms = (time.monotonic() - start) * 1000
            error_msg = str(exc)
            logger.error("  ❌ {} failed: {}", self.name, error_msg)
            state.record_failure(WorkerFailure(
                worker_name=self.name,
                error=error_msg,
                attempt=sum(
                    1 for f in state.failures if f.worker_name == self.name
                ) + 1,
            ))
            state.record_turn(AgentTurn(
                agent_name=self.name,
                action=f"run_{self.name}",
                result=f"error: {error_msg}",
                duration_ms=round(duration_ms, 1),
                success=False,
            ))
            # Don't set is_done; the pipeline runner decides whether to retry or escalate.
            return state

    @abstractmethod
    async def run(self, state: AgentState) -> AgentState:
        """Execute stage logic and return updated state."""
        ...
