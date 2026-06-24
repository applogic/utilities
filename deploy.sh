#!/bin/bash

# Exit immediately if a command fails
set -e

# Function to handle errors
handle_error() {
  echo "Error occurred in script at line $1. Exiting."
  exit 1
}

# Trap errors and report the line number
trap 'handle_error $LINENO' ERR

# Default values
RELEASE_TYPE="none"
SKIP_TESTS=false
ASSUME_YES=false
NO_PROPAGATE=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    patch|minor|major)
      RELEASE_TYPE=$arg
      ;;
    --skip-tests)
      SKIP_TESTS=true
      ;;
    -y|--yes)
      ASSUME_YES=true
      ;;
    --no-propagate)
      NO_PROPAGATE=true
      ;;
    *)
      echo "Invalid argument: $arg"
      echo "Usage: ./deploy.sh [patch|minor|major] [--skip-tests] [-y|--yes] [--no-propagate]"
      exit 1
      ;;
  esac
done

# Validate release type
if [[ "$RELEASE_TYPE" != "patch" && "$RELEASE_TYPE" != "minor" && "$RELEASE_TYPE" != "major" ]]; then
  echo "Missing or invalid release type."
  echo "Usage: ./deploy.sh [patch|minor|major] [--skip-tests] [-y|--yes] [--no-propagate]"
  exit 1
fi

# Discover consumer repos: sibling dirs of this package that depend on
# @archerjessop/utilities and are git repos. New repos are picked up
# automatically — nothing to maintain here.
ROOT="$(cd .. && pwd)"
discover_consumers() {
  local d name
  for d in "$ROOT"/*/; do
    d="${d%/}"
    name="$(basename "$d")"
    [ "$name" = "utilities" ] && continue
    [ -f "$d/package.json" ] || continue
    [ -d "$d/.git" ] || continue
    ( cd "$d" && node -e "const p=require('./package.json');const a={...(p.dependencies||{}),...(p.devDependencies||{})};process.exit(a['@archerjessop/utilities']?0:1)" ) 2>/dev/null || continue
    echo "$d"
  done
}

mapfile -t CONSUMERS < <(discover_consumers)

# Decide whether to bump + deploy consumers after publishing (asked up front
# so the rest of the run is unattended).
BUMP_CONSUMERS=false
if [ "$NO_PROPAGATE" = true ]; then
  echo "Consumer propagation disabled (--no-propagate)."
elif [ ${#CONSUMERS[@]} -eq 0 ]; then
  echo "No consumer repos found — publishing utilities only."
else
  echo "Discovered ${#CONSUMERS[@]} consumer(s) of @archerjessop/utilities:"
  for c in "${CONSUMERS[@]}"; do echo "  - $(basename "$c")"; done
  if [ "$ASSUME_YES" = true ]; then
    BUMP_CONSUMERS=true
    echo "Auto-confirming consumer bump (-y)."
  elif [ -t 0 ]; then
    read -r -p "Bump these consumers to the new version after publish? [y/N] " _ans
    case "$_ans" in [Yy]*) BUMP_CONSUMERS=true;; *) BUMP_CONSUMERS=false;; esac
  else
    echo "Non-interactive shell — skipping consumer bump (use -y to force)."
  fi
fi

# echo "Running build-styles.js..."
# node build-styles.js

# Gate: clean build + tests must pass BEFORE the version is touched. The bump
# used to live inside `npm run release`, where `npm publish`'s prepublishOnly
# hook re-ran build/test AFTER `npm version` had already bumped — so a failure
# there left the version bumped but unpublished. Running them here first means
# a broken build/test exits with the version number untouched, ready to fix.
echo "Cleaning and building..."
npm run clean
npm run build

if [ "$SKIP_TESTS" = false ]; then
  echo "Running tests..."
  npm test
  echo "All tests passed!"
else
  echo "Skipping tests due to --skip-tests flag."
fi

# Build + tests passed — now it is safe to bump, publish, and push.
# --ignore-scripts skips the prepublishOnly re-build/re-test we just ran, so
# nothing build/test-related can fail after the version has been bumped.
echo "Bumping $RELEASE_TYPE version and publishing..."
npm version "$RELEASE_TYPE"
npm publish --access public --ignore-scripts
git push
git push --tags

echo "Deployment completed successfully!"

# Propagate the freshly published version to consumer repos.
if [ "$BUMP_CONSUMERS" = true ]; then
  NEW_VERSION="$(node -p "require('./package.json').version")"
  echo ""
  echo "════════ Propagating @archerjessop/utilities@${NEW_VERSION} ════════"

  # Bump one consumer to the exact published version, commit, push, and run its
  # local deploy.sh unless it is server-managed (PM2 / server path) — in which
  # case the server pulls and deploys itself. Returns non-zero on any failure.
  process_consumer() {
    local dir="$1" version="$2" name
    name="$(basename "$dir")"
    echo "──────── $name ────────"
    (
      set -e
      cd "$dir"

      # Exact version (not @latest) avoids dist-tag/CDN lag right after publish.
      # A bare `npm install` would honor the lockfile and NOT pick up the new
      # minor — which is the trap that kept consumers stuck on old versions.
      local ok=0 attempt
      for attempt in 1 2 3 4 5; do
        if npm install "@archerjessop/utilities@${version}"; then ok=1; break; fi
        echo "  npm install attempt ${attempt} failed (registry lag?) — retrying in 5s..."
        sleep 5
      done
      [ "$ok" = 1 ] || { echo "  ✗ could not install @archerjessop/utilities@${version}"; exit 1; }

      # Stage only the dependency manifest/lock — never sweep unrelated changes.
      git add package.json
      [ -f package-lock.json ] && git add package-lock.json
      if git diff --cached --quiet; then
        echo "  • already at ${version}, nothing to commit"
      else
        git commit -m "bump utilities"
        git push origin "$(git rev-parse --abbrev-ref HEAD)"
        echo "  ✓ committed + pushed \"bump utilities\""
      fi

      if [ -f deploy.sh ]; then
        if grep -qiE "pm2|cd /home" deploy.sh; then
          echo "  • server-managed deploy — skipping local run; server will pull"
        else
          echo "  ▶ running deploy.sh..."
          bash deploy.sh
          echo "  ✓ deploy.sh completed"
        fi
      else
        echo "  • no deploy.sh — bump only"
      fi
    )
  }

  set +e
  RESULTS=()
  FAILED=0
  for c in "${CONSUMERS[@]}"; do
    process_consumer "$c" "$NEW_VERSION"
    if [ $? -eq 0 ]; then
      RESULTS+=("  ✅ $(basename "$c")")
    else
      RESULTS+=("  ❌ $(basename "$c")")
      FAILED=1
    fi
    echo ""
  done
  set -e

  echo "════════ Consumer summary (@${NEW_VERSION}) ════════"
  printf '%s\n' "${RESULTS[@]}"
  if [ "$FAILED" = 1 ]; then
    echo "One or more consumers failed — see logs above."
    exit 1
  fi
  echo "All consumers bumped successfully."
fi
