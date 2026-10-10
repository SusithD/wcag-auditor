from __future__ import annotations

import asyncio
import logging
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Job:
    run_id: str
    argv: list[str]


@dataclass(frozen=True)
class JobResult:
    run_id: str
    returncode: int
    output: str


OnFinish = Callable[[JobResult], Awaitable[None]]


class JobRunner:
    """One job at a time; each job is a subprocess so Playwright memory is freed per run."""

    def __init__(self, on_finish: OnFinish | None = None) -> None:
        self._queue: asyncio.Queue[Job] = asyncio.Queue()
        self._on_finish = on_finish
        self._task: asyncio.Task[None] | None = None

    def submit(self, job: Job) -> None:
        self._queue.put_nowait(job)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None

    async def join(self) -> None:
        await self._queue.join()

    async def _loop(self) -> None:
        while True:
            job = await self._queue.get()
            try:
                result = await self._execute(job)
                if self._on_finish is not None:
                    await self._on_finish(result)
            except Exception:
                log.exception("job %s crashed", job.run_id)
            finally:
                self._queue.task_done()

    async def _execute(self, job: Job) -> JobResult:
        proc = await asyncio.create_subprocess_exec(
            *job.argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            out, _ = await proc.communicate()
        except asyncio.CancelledError:
            proc.kill()
            await proc.wait()
            raise
        return JobResult(job.run_id, proc.returncode or 0, out.decode(errors="replace"))


def auditor_argv(*args: str) -> list[str]:
    return [sys.executable, "-m", "auditor.cli", *args]
