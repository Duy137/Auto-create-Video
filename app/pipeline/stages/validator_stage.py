"""ValidatorStage — wraps pipeline input validation."""
from __future__ import annotations

from app.state import AgentState
from app.pipeline.stages.base import BaseStage
from app.progress import emit_progress
from app.pipeline.nodes.validation.validator import validate_input


class ValidatorStage(BaseStage):
    name = "validator"

    async def run(self, state: AgentState) -> AgentState:
        text = state.effective_script()
        if not text:
            raise ValueError("No script text available for validation")

        await emit_progress({
            "phase": "create_processing",
            "step_key": "validate_input",
            "message": "Đang kiểm tra đầu vào...",
            "tool_name": "Input Validator",
        })

        result = validate_input(text)
        # Warnings are informational — don't fail on them
        from loguru import logger
        for w in result.warnings:
            logger.warning("  [Validator] {}", w)

        await emit_progress({
            "phase": "create_processing",
            "step_key": "validate_input",
            "mark_done": True,
            "intermediate_result": f"Văn bản hợp lệ với {len(result.warnings)} cảnh báo.",
        })

        # Store validated text back as user_input if it came from there
        state = state.model_copy(update={"user_input": result.text})
        return state
