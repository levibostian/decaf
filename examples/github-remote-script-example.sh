#!/usr/bin/env bash
# Example GitHub remote script
# This script demonstrates how to use the GitHub remote script feature

echo "Hello from a remote GitHub script!"
echo "Arguments passed: $@"

# Access the DATA_FILE_PATH environment variable if needed
if [ -n "$DATA_FILE_PATH" ]; then
  echo "Data file path: $DATA_FILE_PATH"
  # You can read/write JSON data from/to this file
fi

exit 0
