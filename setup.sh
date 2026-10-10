#!/usr/bin/env bash
# One-time bootstrap: copies the plan pack from ../06_Prototype, initialises git, opens VS Code.
set -euo pipefail
cd "$(dirname "$0")"

for f in PLAN.md DESIGN_SPEC.md MILESTONES.md CHECK_CATALOGUE.md; do
  cp "../06_Prototype/$f" "./$f"
done
cp .env.example .env

if [ ! -d .git ]; then
  git init -q
  git add -A
  git commit -q -m "Plan pack: PLAN, CLAUDE, DESIGN_SPEC, MILESTONES, CHECK_CATALOGUE, DECISIONS"
fi

echo "Repo ready at $(pwd)"
echo "Tooling check:"
for t in uv pnpm node python3 git; do
  if command -v "$t" >/dev/null; then echo "  $t: $($t --version 2>&1 | head -1)"; else echo "  $t: MISSING"; fi
done
command -v claude >/dev/null && echo "  claude: $(claude --version 2>&1 | head -1)" || echo "  claude (Claude Code CLI): MISSING  -> npm install -g @anthropic-ai/claude-code"

if command -v code >/dev/null; then code .; else open -a "Visual Studio Code" .; fi
