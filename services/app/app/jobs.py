from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import signal
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Job:
    run_id: str
    argv: list[str]
    timeout_s: float | None = None
    env: dict[str, str] | None = field(default=None, repr=False)


@dataclass(frozen=True)
class JobResult:
    run_id: str
    returncode: int
    output: str


OnFinish = Callable[[JobResult], Awaitable[None]]
OnStart = Callable[[str], Awaitable[None]]

CANCELLED = 1001
TIMED_OUT = 1002


class JobRunner:
    """One job at a time; each job is a subprocess so Playwright memory is freed per run."""

    def __init__(
        self,
        on_finish: OnFinish | None = None,
        on_start: OnStart | None = None,
        timeout_s: float = 900,
    ) -> None:
        self._queue: asyncio.Queue[Job] = asyncio.Queue()
        self._on_finish = on_finish
        self._on_start = on_start
        self._timeout_s = timeout_s
        self._task: asyncio.Task[None] | None = None
        self._cancelled: set[str] = set()
        self._running: str | None = None
        self._proc: asyncio.subprocess.Process | None = None

    def cancel(self, run_id: str) -> bool:
        """Drop a queued job or kill the running one; the result reports CANCELLED."""
        if run_id == self._running:
            self._cancelled.add(run_id)
            if self._proc is not None:
                self._kill(self._proc)
            return True
        if any(job.run_id == run_id for job in self._queue._queue):  # type: ignore[attr-defined]
            self._cancelled.add(run_id)
            return True
        return False

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

    @staticmethod
    def _kill(proc: asyncio.subprocess.Process) -> None:
        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(proc.pid, signal.SIGKILL)

    async def _loop(self) -> None:
        while True:
            job = await self._queue.get()
            try:
                if job.run_id in self._cancelled:
                    result = JobResult(job.run_id, CANCELLED, "cancelled before start")
                else:
                    self._running = job.run_id
                    if self._on_start is not None:
                        await self._on_start(job.run_id)
                    result = await self._execute(job)
                self._cancelled.discard(job.run_id)
                if self._on_finish is not None:
                    await self._on_finish(result)
            except Exception:
                log.exception("job %s crashed", job.run_id)
            finally:
                self._running, self._proc = None, None
                self._queue.task_done()

    async def _execute(self, job: Job) -> JobResult:
        proc = await asyncio.create_subprocess_exec(
            *job.argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,
            env={**os.environ, **job.env} if job.env else None,
        )
        self._proc = proc
        if job.run_id in self._cancelled:
            self._kill(proc)
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), job.timeout_s or self._timeout_s)
        except TimeoutError:
            self._kill(proc)
            out, _ = await proc.communicate()
            return JobResult(job.run_id, TIMED_OUT, out.decode(errors="replace"))
        except asyncio.CancelledError:
            self._kill(proc)
            await proc.wait()
            raise
        code = CANCELLED if job.run_id in self._cancelled else proc.returncode or 0
        return JobResult(job.run_id, code, out.decode(errors="replace"))


def auditor_argv(*args: str) -> list[str]:
    return [sys.executable, "-m", "auditor.cli", *args]
