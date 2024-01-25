#!/bin/bash

params=("--send_only")

if [[ -n "$CI" ]]; then
    params=()
fi

certoraRun certora/conf/safeTokenLock.conf \
    "${params[@]}" \
    --msg "Safe Token Lock $*" \
    "$@"
