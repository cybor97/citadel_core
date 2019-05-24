#!/bin/bash
cd /srv/citadel_core;
ln -f ./git-hooks/pre-push.sh ./.git/hooks/pre-push;

npm i;
npx sequelize-cli db:migrate;
BUILD_RESULT=$?;

if [[ "$@" != "skip-build-number" ]]; then
    BUILD=$((`cat build.ver`+1))
    echo $BUILD > build.ver
    echo "Build #$BUILD"
fi;

exit $BUILD_RESULT;