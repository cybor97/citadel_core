unzip -o citadel_core.zip -d /srv/citadel_core;
rm -f citadel_core.zip;
cd /srv/citadel_core;
rm -rf node_modules;
./build.sh;
pm2 restart all;
rm -f install.sh;