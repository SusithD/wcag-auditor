# ruff: noqa: E501
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

CONDITIONS = ("rule_only", "hybrid")
BLOCK_SIZE = 4

CONSENT_STATEMENTS = [
    "I confirm that I have read and understood the Participant Information Sheet.",
    "I have had the opportunity to ask questions about the study, and any questions I have asked have been answered to my satisfaction.",
    "I understand that my participation is voluntary and that I am free to withdraw at any time, without giving a reason, and without any negative consequence.",
    "I understand that I can withdraw my data up to 30 days after my session by emailing the researcher.",
    "I confirm that I am aged 18 or over.",
    "I understand that anonymised research data may be retained for up to 5 years after the study, and may be shared with the wider research community in fully anonymised form.",
]
OPTIONAL_CONSENTS = {
    "screen_recording": "I consent to my screen being recorded during the session.",
    "audio_recording": "I consent to my voice being recorded during the session (audio narration).",
    "quotes": "I consent to short, direct, anonymous quotes from my debrief responses being used in the thesis and any resulting publications.",
    "contact_for_results": "I consent to being contacted by the researcher after the study to receive a summary of the results.",
}
SUS_ITEMS = [
    "I think that I would like to use this report frequently.",
    "I found the report unnecessarily complex.",
    "I thought the report was easy to use.",
    "I think that I would need the support of a technical person to be able to use this report.",
    "I found the various functions in this report were well integrated.",
    "I thought there was too much inconsistency in this report.",
    "I would imagine that most people would learn to use this report very quickly.",
    "I found the report very cumbersome to use.",
    "I felt very confident using the report.",
    "I needed to learn a lot of things before I could get going with this report.",
]
DEBRIEF_QUESTIONS = [
    "Between the two reports you used today, which did you find more useful, and why?",
    "Was there anything about either report that confused you or slowed you down?",
    "If you could change one thing about the hybrid report, what would it be?",
]
DEMOGRAPHICS = {
    "age_band": ["18-24", "25-34", "35-44", "45-54", "55 or over", "Prefer not to say"],
    "years_experience": ["Under 1", "1-2", "3-5", "6-10", "Over 10"],
    "role_type": ["Professional web developer", "Final-year computing student", "Other"],
    "accessibility_exposure": ["None", "Some self-study", "Formal training", "Work experience"],
    "wcag_familiarity": ["1 (none)", "2", "3", "4", "5 (expert)"],
}


def sus_score(scores: list[int]) -> float:
    """Brooke (1996): odd items score - 1, even items 5 - score, sum x 2.5 (0-100)."""
    if len(scores) != len(SUS_ITEMS) or any(not 1 <= s <= 5 for s in scores):
        raise ValueError("SUS needs ten responses between 1 and 5")
    adjusted = [(s - 1) if i % 2 == 0 else (5 - s) for i, s in enumerate(scores)]
    return sum(adjusted) * 2.5


@dataclass(frozen=True)
class Task:
    id: str
    set: str
    sc: str
    title: str
    folder: str
    brief: str
    rubric: dict[str, Any]


@dataclass(frozen=True)
class Assignment:
    code: str
    synthetic: bool
    order: str
    conditions: tuple[str, str]
    sets: tuple[str, str]
    task_order: tuple[str, ...]


@dataclass(frozen=True)
class Step:
    kind: str
    task_index: int | None = None
    block: int | None = None


def steps() -> list[Step]:
    out = [Step("consent"), Step("demographics")]
    for index in range(1, BLOCK_SIZE + 1):
        out.append(Step("task", index, 1))
    out += [Step("sus", block=1), Step("break")]
    for index in range(BLOCK_SIZE + 1, 2 * BLOCK_SIZE + 1):
        out.append(Step("task", index, 2))
    out += [Step("sus", block=2), Step("debrief"), Step("done")]
    return out


class Study:
    def __init__(self, directory: Path) -> None:
        data = yaml.safe_load((directory / "tasks.yaml").read_text(encoding="utf-8"))
        self.tasks: dict[str, Task] = {
            t["id"]: Task(
                t["id"], t["set"], t["sc"], t["title"], t["folder"], t["brief"], t["rubric"]
            )
            for t in data["tasks"]
        }
        self.sets: dict[str, list[str]] = data["sets"]
        self.assignments: dict[str, Assignment] = {}
        with (directory / "assignments.csv").open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                self.assignments[row["participant_code"]] = Assignment(
                    row["participant_code"],
                    row["synthetic"] == "1",
                    row["order"],
                    (row["block1_condition"], row["block2_condition"]),
                    (row["block1_set"], row["block2_set"]),
                    tuple(row["task_order"].split()),
                )

    def condition_for(self, assignment: Assignment, task_index: int) -> str:
        return assignment.conditions[0 if task_index <= BLOCK_SIZE else 1]

    def task_for(self, assignment: Assignment, task_index: int) -> Task:
        return self.tasks[assignment.task_order[task_index - 1]]
