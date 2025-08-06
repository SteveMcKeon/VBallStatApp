# Step 1: Run rsync from WSL
wsl rsync -av --exclude 'Dockerfile' `
             --exclude 'docker-compose*yml' `
             --exclude '.git/' `
             --exclude 'VBallAppNotes.txt' `
             --exclude 'push_to_prod.sh' `
             --exclude 'videos/' `
             --exclude 'node_modules/' `
             /mnt/c/VBallStatApp_dev/ /mnt/c/VBallStatApp_prod/

Set-Location "C:\VBallStatApp_prod\frontend"
npm install
npm run build
docker compose build --no-cache backend tus nginx
docker compose up -d
Set-Location "C:\VBallStatApp_dev"