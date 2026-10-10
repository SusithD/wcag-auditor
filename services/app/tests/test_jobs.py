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
