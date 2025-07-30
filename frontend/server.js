const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const https = require('https');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const activeTokens = new Map();
dotenv.config();
const app = express();
const PORT = 3001;
const VIDEO_DIR = '/app/videos';
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
function pruneExpiredTokens() {
  const now = Math.floor(Date.now() / 1000);
  for (const [token, exp] of activeTokens.entries()) {
    if (exp + 15 * 60 < now) {
      activeTokens.delete(token);
    }
  }
}
setInterval(pruneExpiredTokens, 10 * 60 * 1000);

app.use((req, res, next) => {
  console.log(`🛰️  ${req.method} ${req.url}`);
  next();
});

app.use(cors());

app.use(express.json());

app.use('/videos', express.static(VIDEO_DIR));

app.get('/api/videos', (req, res) => {
  console.log('Reading video directory:', VIDEO_DIR);
  fs.readdir(VIDEO_DIR, (err, files) => {
    if (err) {
      console.error('Failed to read video directory:', VIDEO_DIR);
      console.error(err);
      return res.status(500).json({ error: 'Unable to list files' });
    }
    const mp4s = files.filter(file => file.endsWith('.mp4'));
    console.log('Found video files:', mp4s);
    res.json(mp4s);
  });
});

app.post('/api/validate-admin-password', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false });
  const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ success: false, message: 'Invalid password' });
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  const { exp } = jwt.decode(token);
  activeTokens.set(token, exp);
  res.json({ success: true, token });
});

app.post('/api/save-stats', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') throw new Error();
  } catch {
    return res.status(403).json({ success: false, message: 'Invalid token' });
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

app.post('/api/refresh-token', (req, res) => {
  const { token: oldToken } = req.body;
  if (!oldToken || !activeTokens.has(oldToken)) {
    return res.status(403).json({ success: false, message: 'Unknown token' });
  }
  try {
    const decoded = jwt.verify(oldToken, process.env.JWT_SECRET, { ignoreExpiration: true });
    const now = Math.floor(Date.now() / 1000);
    const exp = activeTokens.get(oldToken);
    const GRACE_PERIOD = 15 * 60; // 15 minutes
    if (exp && now > exp + GRACE_PERIOD) {
      activeTokens.delete(oldToken);
      return res.status(403).json({ success: false, message: 'Token expired too long ago' });
    }
    const newToken = jwt.sign({ role: decoded.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const { exp: newExp } = jwt.decode(newToken);
    activeTokens.delete(oldToken);
    activeTokens.set(newToken, newExp);
    res.json({ success: true, token: newToken });
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
});

app.post('/api/update-stat', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') throw new Error();
  } catch {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
  const { statId, updates } = req.body;
  if (!statId || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ success: false, message: 'Invalid input: must include statId and updates object' });
  }
  console.log(`Updating stat ID: ${statId} with values:`, updates);
  const { error } = await supabase
    .from('stats')
    .update(updates)
    .eq('id', statId);
  if (error) {
    console.error('Supabase update error:', error);
    return res.status(500).json({ success: false, message: 'Update failed' });
  }
  res.json({ success: true });
});

app.delete('/api/delete-stat/:id', async (req, res) => {
  const { id } = req.params; 
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); 
    if (decoded.role !== 'admin') throw new Error();
  } catch {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
  try {
    const { error } = await supabase
      .from('stats')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Supabase delete error:', error);
      return res.status(500).json({ success: false, message: 'Failed to delete row' });
    }
    res.json({ success: true, message: 'Row deleted successfully' });
  } catch (err) {
    console.error('Delete row error:', err);
    res.status(500).json({ success: false, message: 'Server error while deleting' });
  }
});
const options = {
  key: fs.readFileSync('./cert/key.pem'),
  cert: fs.readFileSync('./cert/cert.pem'),
};
https.createServer(options, app).listen(3001, '0.0.0.0', () => {
  console.log('HTTPS server running on port 3001');
});

