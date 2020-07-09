#!/bin/sh
set -e

echo "Generate Types for: $1"

if [ ! -d "build" ]; then
  yarn build:sol
fi

case $1 in
all)
  yarn generate:types
  ;;
*)
  if [ -d "types/$1" ] && [ "$2" != "--overwrite" ]; then 
    echo "types/$1 already exists, please use generate:types $1 --overwrite to overwrite"
    exit 0
  fi
  npx typechain --outDir types/"$1" --target="$1" 'build/contracts/*.json'
  ;;
esac
