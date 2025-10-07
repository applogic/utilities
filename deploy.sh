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

# Parse arguments
for arg in "$@"; do
  case $arg in
    patch|minor|major)
      RELEASE_TYPE=$arg
      ;;
    --skip-tests)
      SKIP_TESTS=true
      ;;
    *)
      echo "Invalid argument: $arg"
      echo "Usage: ./deploy.sh [patch|minor|major] [--skip-tests]"
      exit 1
      ;;
  esac
done

# Validate release type
if [[ "$RELEASE_TYPE" != "patch" && "$RELEASE_TYPE" != "minor" && "$RELEASE_TYPE" != "major" ]]; then
  echo "Missing or invalid release type."
  echo "Usage: ./deploy.sh [patch|minor|major] [--skip-tests]"
  exit 1
fi

# echo "Running build-styles.js..."
# node build-styles.js

echo "Running npm build..."
npm run build

if [ "$SKIP_TESTS" = false ]; then
  echo "Running tests..."
  npm test
  echo "All tests passed!"
else
  echo "Skipping tests due to --skip-tests flag."
fi

echo "Releasing $RELEASE_TYPE version..."
npm run release:$RELEASE_TYPE

echo "Deployment completed successfully!"
