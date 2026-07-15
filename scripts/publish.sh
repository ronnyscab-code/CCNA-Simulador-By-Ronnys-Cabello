#!/usr/bin/env bash
#
# publish.sh — one-shot publish of OpenCCNA Simulator to GitHub + Pages.
#
# Prerequisite: you are authenticated with the GitHub CLI:
#     gh auth login
#
# Then run from the repo root:
#     bash scripts/publish.sh
#
# It creates the (public) repository, pushes main + tags, and lets the
# GitHub Actions workflow (.github/workflows/deploy-pages.yml) publish the
# static site to GitHub Pages.

set -euo pipefail

REPO_NAME="CCNA-Simulador-By-Ronnys-Cabello"

if ! gh auth status >/dev/null 2>&1; then
  echo "You are not logged in. Run: gh auth login" >&2
  exit 1
fi

# Create the repo from this local folder and push in one step (idempotent-ish:
# if the remote already exists this will error, which is fine to re-run by hand).
gh repo create "$REPO_NAME" --public --source=. --remote=origin --push

# Push tags too (the repo create --push only pushes the current branch).
git push origin --tags

# Ensure Pages is set to build from GitHub Actions.
OWNER=$(gh api user --jq .login)
gh api -X POST "repos/$OWNER/$REPO_NAME/pages" -f build_type=workflow >/dev/null 2>&1 || true

echo
echo "Done. The Pages deploy workflow is running."
echo "Site will be live at: https://$OWNER.github.io/$REPO_NAME/"
echo "Watch the build: gh run watch --repo $OWNER/$REPO_NAME"
