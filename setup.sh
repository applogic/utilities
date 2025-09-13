#!/usr/bin/env bash

# Ensure we are inside utilities/

# Create directories

# Create files if they don't already exist
touch_if_missing() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "Creating $file"
    : > "$file"
  else
    echo "Skipping $file (already exists)"
  fi
}

touch_if_missing src/styles/variables.css
touch_if_missing src/styles/footer.css
touch_if_missing src/styles/dashboard.css
touch_if_missing src/styles/index.js
touch_if_missing build-styles.js
touch_if_missing rollup.config.js
