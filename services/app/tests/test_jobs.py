import asyncio
import sys

from app.jobs import Job, JobResult, JobRunner


def test_runner_executes_jobs_sequentially_and_reports() -> None:
    async def scenario() -> list[JobResult]:
        results: list[JobResult] = []

        async def on_finish(result: JobResult) -> None:
            results.append(result)

        runner = JobRunner(on_finish)
        runner.start()
        runner.submit(Job("a", [sys.executable, "-c", "print('one')"]))
        runner.submit(Job("b", [sys.executable, "-c", "import sys; sys.exit(3)"]))
        await runner.join()
        await runner.stop()
        return results

    results = asyncio.run(scenario())
    assert [(r.run_id, r.returncode) for r in results] == [("a", 0), ("b", 3)]
    assert "one" in results[0].output


def test_cancelling_a_running_job_kills_it_and_reports_cancelled() -> None:
    from app.jobs import CANCELLED

    async def scenario() -> list[JobResult]:
        results: list[JobResult] = []

        async def on_finish(result: JobResult) -> None:
            results.append(result)

        runner = JobRunner(on_finish)
        runner.start()
        runner.submit(Job("slow", [sys.executable, "-c", "import time; time.sleep(60)"]))
        for _ in range(100):
            await asyncio.sleep(0.05)
            if runner._proc is not None:
                break
        assert runner.cancel("slow") is True
        await runner.join()
        await runner.stop()
        assert results[0].returncode == CANCELLED
        return results

    asyncio.run(scenario())


def test_a_job_that_exceeds_the_timeout_is_killed_and_reported() -> None:
    from app.jobs import TIMED_OUT

    async def scenario() -> JobResult:
        results: list[JobResult] = []

        async def on_finish(result: JobResult) -> None:
            results.append(result)

        runner = JobRunner(on_finish, timeout_s=0.5)
        runner.start()
        runner.submit(Job("hang", [sys.executable, "-c", "import time; time.sleep(60)"]))
        await runner.join()
        await runner.stop()
        return results[0]

    assert asyncio.run(scenario()).returncode == TIMED_OUT
