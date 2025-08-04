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
 
app.patch('/api/update-game/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });

  const decoded = verifySupabaseToken(token);
  const userRole = decoded?.user_metadata?.role;
  if (!decoded || !userRole) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const { id } = req.params;
  const { updates } = req.body;

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid updates object' });
  }

  try {
    const { error } = await supabase
      .from('games')
      .update(updates)
      .eq('id', id);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Update game error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/mark-processed', async (req, res) => {
  const { gameId } = req.body;

  if (!gameId) {
    return res.status(400).json({ success: false, message: 'Missing gameId' });
  }

  try {
    const { error } = await supabase
      .from('games')
      .update({ processed: true })
      .eq('id', gameId);

    if (error) {
      console.error('Failed to mark video as processed:', error);
      return res.status(500).json({ success: false, message: 'Database update failed' });
    }

    console.log(`Marked Game ID ${gameId} as processed`);
    res.json({ success: true });
  } catch (err) {
    console.error('Unexpected server error:', err);
    res.status(500).json({ success: false, message: 'Unexpected server error' });
  }
});

const parseMetadata = (upload_metadata) => {
  const meta = {};
  upload_metadata.split(',').forEach(pair => {
    const [key, b64value] = pair.split(' ');
    meta[key] = Buffer.from(b64value, 'base64').toString('utf-8');
  });
  return meta;
};

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

app.post('/api/save-stats', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });

  const decoded = verifySupabaseToken(token);
  if (!decoded || decoded.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid input: rows must be a non-empty array' });
  }

  const allowedFields = [
    'game_id', 'timestamp', 'rally_id', 'posession_seq', 'import_seq',
    'player', 'action_type', 'quality', 'result', 'notes',
    'our_score', 'opp_score', 'set_to_position', 'set_to_player', 'set'
  ];

  const inserts = [];
  const updates = [];

  for (const row of rows) {
    const sanitized = {};
    for (const field of allowedFields) {
      if (field in row) sanitized[field] = row[field];
    }
    if (row.id) {
      updates.push({ id: row.id, updates: sanitized });
    } else {
      inserts.push(sanitized);
    }
  }

  try {
    let insertedRows = [];
    if (inserts.length > 0) {
      const { data, error } = await supabase
        .from('stats')
        .insert(inserts)
        .select();
      if (error) throw error;
      insertedRows = data;
    }

    for (const { id, updates: updateFields } of updates) {
      const { error } = await supabase
        .from('stats')
        .update(updateFields)
        .eq('id', id);
      if (error) throw error;
    }

    res.json({ success: true, insertedRows });
  } catch (err) {
    console.error('save-stats error:', err);
    res.status(500).json({ success: false, message: 'Save failed', error: err.message });
  }
});

app.post('/api/update-stat', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });

  const decoded = verifySupabaseToken(token);
  const userRole = decoded?.user_metadata?.role;

  if (!decoded || !['admin', 'editor'].includes(userRole)) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const { statId, updates } = req.body;
  if (!statId || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ success: false, message: 'Invalid input: must include statId and updates object' });
  }

  const editorAllowedFields = ['player', 'action_type', 'quality', 'notes'];
  if (userRole === 'editor') {
    const attemptedFields = Object.keys(updates);
    const invalidFields = attemptedFields.filter(f => !editorAllowedFields.includes(f));
    if (invalidFields.length > 0) {
      return res.status(403).json({ success: false, message: `Editors cannot modify fields: ${invalidFields.join(', ')}` });
    }
  }

  try {
    const { error } = await supabase
      .from('stats')
      .update(updates)
      .eq('id', statId);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error('Update stat error:', err);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
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

app.delete('/api/delete-stat/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });

  const decoded = verifySupabaseToken(token);
  if (!decoded || decoded.user_metadata?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('stats')
      .delete()
      .eq('id', id);
    if (error) throw error;

    res.json({ success: true, message: 'Row deleted successfully' });
  } catch (err) {
    console.error('Delete row error:', err);
    res.status(500).json({ success: false, message: 'Server error while deleting' });
  }
});

https.createServer(options, app).listen(EXPRESSPORT, '0.0.0.0', () => {
  console.log(`HTTPS server running on port ${EXPRESSPORT}`);
});
