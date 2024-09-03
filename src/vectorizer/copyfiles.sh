#!/bin/bash

# Function to display help
usage() {
  echo "Usage: $0 -s SOURCE_DIR -d DEST_DIR"
  exit 1
}

# Parse input flags
while getopts ":s:d:" opt; do
  case ${opt} in
    s )
      src_dir=$OPTARG
      ;;
    d )
      dest_dir=$OPTARG
      ;;
    \? )
      usage
      ;;
  esac
done

# Check if both source and destination directories are provided
if [ -z "$src_dir" ] || [ -z "$dest_dir" ]; then
  usage
fi

# Create destination directory if it doesn't exist
mkdir -p "$dest_dir"

# Find and copy the files
find "$src_dir" -type f \( -iname "*.pdf" -o -iname "*.docx" \) -exec cp --parents {} "$dest_dir" \;

echo "Files copied successfully!"