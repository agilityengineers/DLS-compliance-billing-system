#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required." >&2
  exit 1
fi

repository="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
root="$(git rev-parse --show-toplevel)"
policy="$root/.github/main-branch-protection.json"

if [[ ! -f "$policy" ]]; then
  echo "Protection policy not found: $policy" >&2
  exit 1
fi

echo "Applying versioned main-branch protection to $repository"
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "repos/$repository/branches/main/protection" \
  --input "$policy"

echo "Protection applied. No branch history was changed."