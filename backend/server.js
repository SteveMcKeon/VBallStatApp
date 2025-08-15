const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const https = require('https');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const verifySupabaseToken = require('./src/utils/verifySupabaseToken');
dotenv.config();
const app = express();
const EXPRESSPORT = 3001;
const VIDEO_DIR = '/app/videos';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
function requireInternal(req, res, next) {
  const headerKey = req.headers['x-internal-key'] || '';
  const envLen = (process.env.INTERNAL_API_KEY || '').length;
  const ok = envLen > 0 && headerKey === process.env.INTERNAL_API_KEY;
  if (ok) return next();
  return res.status(403).json({ success: false, message: 'Forbidden (internal key required)' });
}


const fsp = require('fs/promises');
const TUS_DIR = path.join(VIDEO_DIR, 'user-uploads');
app.use((req, res, next) => {
  console.log(`🛰️  ${req.method} ${req.url}`);
  next();
});

app.use(cors());
app.use(express.json());
app.use('/videos', express.static(VIDEO_DIR));

const options = {
  key: fs.readFileSync('./cert/key.pem'),
  cert: fs.readFileSync('./cert/cert.pem'),
};

async function readSidecar(id) {
  for (const sfx of ['.json', '.info']) {
    const p = path.join(TUS_DIR, id + sfx);
    try {
      const raw = await fsp.readFile(p, 'utf8');
      return { path: p, data: JSON.parse(raw) };
    } catch (_) {}
  }
  return null;
}

function extFromFilename(name, fallback = '.mp4') {
  const ext = path.extname(name || '');
  return ext || fallback;
}

app.delete('/api/admin/games/:id', requireInternal, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { error } = await supabase.from('games').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message || 'Delete failed' });

    return res.json({ ok: true });
  } catch (e) {
    console.error('❌ delete-by-id failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

app.delete('/api/admin/games', requireInternal, async (req, res) => {
  try {
    const { date, team_id, game_number } = req.body || {};
    if (!date || !team_id || !game_number)
      return res.status(400).json({ error: 'Missing date, team_id or game_number' });

    const title = `${date} Game ${Number(game_number)}`;
    const { error } = await supabase
      .from('games')
      .delete()
      .eq('team_id', team_id)
      .eq('title', title);

    if (error) return res.status(500).json({ error: error.message || 'Delete failed' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('❌ delete-by-meta failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

app.post('/api/mark-processed', requireInternal, async (req, res) => {
  const { gameId } = req.body;
  console.log(`Got Game ID ${gameId} for mark as processed.`);
  if (!gameId) {
    return res.status(400).json({ success: false, message: 'Missing gameId' });
  }
  try {
    const { data, error } = await supabase
      .from('games')
      .update({ processed: true })
      .eq('id', gameId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Failed to mark video as processed:', error);
      return res.status(500).json({ success: false, message: 'Database update failed' });
    }
    if (!data) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }
    console.log(`Marked Game ID ${gameId} as processed`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Unexpected server error:', err);
    return res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});


app.post('/api/finalize-upload', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const userId = decoded?.sub;
    if (!userId) return res.status(403).json({ error: 'Unauthorized' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const src = path.join(TUS_DIR, id);
    const srcStat = await fsp.stat(src).catch(() => null);
    if (!srcStat) return res.status(404).json({ error: 'Upload not found' });
    const sidecar = await readSidecar(id);
    if (!sidecar) return res.status(500).json({ error: 'Metadata not found' });
    const uploadUserId = sidecar.data?.metadata?.user_id;
    if (uploadUserId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const expectedSize = Number(sidecar.data?.size || 0);
    if (!expectedSize || srcStat.size < expectedSize) {
      return res.status(409).json({
        error: 'Upload not complete',
        expectedSize,
        bytesOnDisk: srcStat.size
      });
    }
    const ext = extFromFilename(sidecar.data?.metadata?.filename);
    const destName = `${id}_READY${ext}`;
    const dest = path.join(TUS_DIR, destName);
    try {
      await fsp.rename(src, dest);
    } catch (err) {
      if (err.code === 'EEXIST') {
      } else if (err.code === 'EXDEV') {
        await fsp.copyFile(src, dest);
        await fsp.unlink(src).catch(() => {});
      } else {
        throw err;
      }
    }
    return res.json({ ok: true, file: destName });
  } catch (e) {
    console.error('❌ finalize-upload failed:', e);
    return res.status(500).json({ error: 'Finalize failed' });
  }
});

app.get('/api/videos', (req, res) => {
  console.log('Reading video directory:', VIDEO_DIR);
  fs.readdir(VIDEO_DIR, (err, files) => {
    if (err) {
      console.error('Failed to read video directory:', VIDEO_DIR);
      return res.status(500).json({ error: 'Unable to list files' });
    }
    const mp4s = files.filter(file => file.endsWith('.mp4'));
    res.json(mp4s);
  });
});

app.delete('/api/delete-upload/:id', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });

  const decoded = verifySupabaseToken(token);
  const userId = decoded?.sub;
  if (!userId) return res.status(403).json({ success: false, message: 'Unauthorized' });

  const uploadId = req.params.id;
  const filePath = path.join(VIDEO_DIR, 'user-uploads', uploadId);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'Upload not found' });
  }

  const infoPath = `${filePath}.json`;
  if (!fs.existsSync(infoPath)) {
    return res.status(500).json({ success: false, message: 'Metadata not found' });
  }

  const uploadInfo = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
  const uploadUserId = uploadInfo.metadata.user_id;

  if (uploadUserId !== userId) {
    return res.status(403).json({ success: false, message: 'You do not have permission to delete this upload' });
  }

  fs.unlinkSync(filePath);
  fs.unlinkSync(infoPath);

  console.log(`Deleted upload ${uploadId} by user ${userId}`);
  res.json({ success: true });
});

https.createServer(options, app).listen(EXPRESSPORT, '0.0.0.0', () => {
  console.log(`HTTPS server running on port ${EXPRESSPORT}`);
});
