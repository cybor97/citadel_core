unzip -o citadel_core.zip -d /srv/citadel_core;
rm -f citadel_core.zip;
/srv/citadel_core/build.sh;
pm2 restart app;
rm -f install.sh;