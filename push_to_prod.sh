#!/bin/bash

rsync -av --exclude 'Dockerfile' \
           --exclude 'docker-compose*yml' \
           --exclude 'backup/' \
           --exclude 'VBallAppNotes.txt' \
           --exclude 'push_to_prod.sh' \
           --exclude 'videos/' \
           --exclude 'node_modules/' \
           /mnt/c/VBallStatApp_dev/ /mnt/c/VBallStatApp_prod/

echo "// rebuild: $(date)" >> /mnt/c/VBallStatApp_prod/frontend/vite.config.js
		   