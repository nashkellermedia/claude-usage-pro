#!/bin/bash
VERSION=$(grep "\"version\"" manifest.json | sed "s/.*: \"\(.*\)\".*/\1/")
FILENAME="claude-usage-pro-v${VERSION}.zip"
echo "Building Claude Usage Pro v${VERSION}..."
rm -f claude-usage-pro-*.zip
zip -r "$FILENAME" manifest.json background/ content/ lib/ popup/ icons/ -x "*.git*" -x "*.DS_Store"
echo "Created: $FILENAME"
du -h "$FILENAME"
