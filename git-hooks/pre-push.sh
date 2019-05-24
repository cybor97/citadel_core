./build.sh;
BUILD_RESULT=$?;
if [[ $BUILD_RESULT == 0 ]]; then
    git add build.ver;
    git commit --amend --no-edit;
else
    git reset origin/$(git rev-parse --symbolic-full-name --abbrev-ref HEAD);
fi;
exit $BUILD_RESULT;