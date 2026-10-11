#!/usr/bin/env bash
# Compare downloaded encrypted bytes, not just S3 ContentLength/metadata.
set -euo pipefail
if (( $# != 4 )); then
  echo "Encrypted backup readback verification failed" >&2
  exit 1
fi
if [[ ! -s "$1" || ! -s "$2" || ! -s "$3" || ! -s "$4" ]] \
  || ! cmp --silent -- "$1" "$3" \
  || ! cmp --silent -- "$2" "$4"; then
  echo "Encrypted backup readback verification failed" >&2
  exit 1
fi
cipher_digest="$(sha256sum -- "$1" | cut -d ' ' -f 1)"
checksum_line="$(cat -- "$2")"
if [[ "$checksum_line" != "$cipher_digest  $(basename -- "$1")" ]]; then
  echo "Encrypted backup readback verification failed" >&2
  exit 1
fi
echo "Durable encrypted backup and checksum readback match the local generation"
