#!/bin/sh
set -eu

cd /app/services/app

hfs() {
	if [ -n "${HF_DATASET_REPO:-}" ]; then
		python -m app.hfsync "$@" || echo "hfsync $* skipped" >&2
	fi
}

if [ -n "${HF_DATASET_REPO:-}" ]; then
	hfs restore
fi
if [ -n "${HF_MODEL_REPO:-}" ]; then
	python -m app.hfsync model || echo "hfsync model skipped" >&2
fi

pids=""

uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 &
pids="$pids $!"

(cd /srv && PORT=3000 exec node server.js) &
pids="$pids $!"

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
pids="$pids $!"

loop_pid=""
if [ -n "${HF_DATASET_REPO:-}" ]; then
	python -m app.hfsync loop &
	loop_pid=$!
fi

stop() {
	trap - TERM INT
	hfs push
	kill $pids $loop_pid 2>/dev/null || true
	wait 2>/dev/null || true
	exit 0
}
trap stop TERM INT

while :; do
	for p in $pids; do
		if ! kill -0 "$p" 2>/dev/null; then
			echo "process $p exited" >&2
			kill $pids $loop_pid 2>/dev/null || true
			exit 1
		fi
	done
	sleep 2 &
	wait $! || true
done
