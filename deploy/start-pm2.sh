#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /home/u906481625/domains/3ertiempo.online/backend
pm2 start /home/u906481625/domains/3ertiempo.online/ecosystem.config.cjs --update-env
pm2 save
