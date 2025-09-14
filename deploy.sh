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

# Read argument (default = patch)
RELEASE_TYPE=${1:-fail}

# Validate input
if [[ "$RELEASE_TYPE" != "patch" && "$RELEASE_TYPE" != "minor" && "$RELEASE_TYPE" != "major" ]]; then
  echo "Invalid release type: $RELEASE_TYPE"
  echo "Usage: ./deploy.sh [patch|minor|major]"
  exit 1
fi

echo "Running build-styles.js..."
node build-styles.js

echo "Running npm build..."
npm run build

echo "Running tests..."
npm test

echo "All tests passed! Releasing $RELEASE_TYPE version..."
npm run release:$RELEASE_TYPE

echo "Deployment completed successfully!"
