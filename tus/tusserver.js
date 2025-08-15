const fs = require('fs');
const https = require('https');
const path = require('path');
const { Server, EVENTS } = require('@tus/server');
const { FileStore } = require('@tus/file-store');
const dotenv = require('dotenv');
dotenv.config();

const VIDEO_DIR = '/app/videos';
const uploadPath = path.join(VIDEO_DIR, 'user-uploads');

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const tusServer = new Server({
  path: '/api/upload-game',
  datastore: new FileStore({ directory: uploadPath }),
  respectForwardedHeaders: true,
  generateUrl: (req, { id, path }) => {
    return `${path}/${id}`;
  }  ,
  namingFunction: (req, metadata) => {
    const dateStr = metadata.date || 'unknown-date';
    const gameGroupId = metadata.game_group_id || 'unknown-group';
    const originalFilename = metadata.filename || 'unnamed';
    const setnumber = metadata.setNumber || 'unnamed';
    const finalFileName = `${gameGroupId}_SET-${setnumber}`;
    console.log(`Saving upload as: ${finalFileName}`);
    return finalFileName;
  },
  async onUploadFinish(req, res, upload) {
    console.log(`✅ Upload finished and saved as: ${upload.id}`);
    return { status_code: 204 };
  }
});

const options = {
  key: fs.readFileSync('./cert/key.pem'),
  cert: fs.readFileSync('./cert/cert.pem'),
};

https.createServer(options, (req, res) => {
  console.log(`🛰️  ${req.method} ${req.url}`);
  tusServer.handle(req, res);
}).listen(3002, '0.0.0.0', () => {
  console.log('TUS HTTPS Server running on port 3002');
});

