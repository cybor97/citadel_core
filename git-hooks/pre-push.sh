#!/bin/bash
./build.sh;
BUILD_RESULT=$?;
if [[ $BUILD_RESULT == 0 ]]; then
    git tag build$((`git tag|grep "build[0-9]*"|grep "[0-9]*" -o`+1));
    git push --tags;
else
    git reset origin/$(git rev-parse --symbolic-full-name --abbrev-ref HEAD);
fi;
exit $BUILD_RESULT;