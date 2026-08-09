#!/bin/bash
# Stop hook: nudges Claude to run /wrap when this branch has commits that
# post-date the last STATUS.md refresh. Fires at most once per session
# (session-scoped marker in /tmp) so it doesn't nag on every turn.
# See .claude/CLAUDE.md "Session workflow" — /wrap is supposed to run at the
# end of every session; this hook exists because that's advisory text a
# session can forget to follow, and forgetting it was the reason this hook
# was added.

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$session_id" ] && session_id="unknown"
marker="/tmp/.claude-wrap-nudge-${session_id}"

[ -f "$marker" ] && exit 0

repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$repo_root" ] && exit 0
cd "$repo_root" 2>/dev/null || exit 0
[ -f STATUS.md ] || exit 0

last_wrap_commit=$(git log -1 --format=%H -- STATUS.md 2>/dev/null)

if [ -z "$last_wrap_commit" ]; then
  range="HEAD"
else
  range="${last_wrap_commit}..HEAD"
fi

new_commits=$(git rev-list "$range" -- . ':!STATUS.md' ':!ROADMAP.md' 2>/dev/null | wc -l | tr -d ' ')
[ -z "$new_commits" ] && new_commits=0

if [ "$new_commits" -gt 0 ] 2>/dev/null; then
  touch "$marker" 2>/dev/null
  reason="This branch has ${new_commits} commit(s) not yet reflected in STATUS.md/ROADMAP.md. Run /wrap before finishing so the next /standup is accurate."
  jq -n --arg reason "$reason" '{decision:"block", reason:$reason}'
fi
