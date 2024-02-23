#!/bin/bash

params=("--send_only")

if [[ -n "$CI" ]]; then
    params=()
fi

certoraRun certora/conf/safeToken.conf \
    "${params[@]}" \
    --msg "Safe Token $*" \
    "$@"
