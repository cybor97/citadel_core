#!/bin/bash
cd /srv/citadel_core;
ln -f ./git-hooks/pre-push.sh $(dirname "$0")/.git/hooks/pre-push;

npm i;
npx sequelize-cli db:migrate;
BUILD_RESULT=$?;

exit $BUILD_RESULT;