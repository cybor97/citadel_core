#!/bin/bash
./build.sh;
BUILD_RESULT=$?;
if [[ $BUILD_RESULT == 0 ]]; then
    echo "Build success, pushing";
else
    git reset origin/$(git rev-parse --symbolic-full-name --abbrev-ref HEAD);
fi;
exit $BUILD_RESULT;