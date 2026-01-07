#!/bin/bash
# Test script with shebang for testing GitHub remote script execution

# Echo the arguments passed to this script
echo "Script executed with args: $@"

# If DATA_FILE_PATH is set, write some output to it
if [ -n "$DATA_FILE_PATH" ]; then
  echo '{"executed": true, "args": "'"$@"'"}' > "$DATA_FILE_PATH"
fi

exit 0
