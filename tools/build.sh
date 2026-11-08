#!/bin/bash
# Build the 3D bundle + page. Usage: ./build.sh  (writes into /home/claude/cb/out)
set -e
cd /home/claude/cb
node test/unit.mjs | tail -1
npx esbuild src/cosmos3d.js --bundle --format=iife --minify --legal-comments=none --outfile=out/cosmos3d.js --log-level=warning
cp src/cosmos3d.css out/cosmos3d.css
node assemble.js
