const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const https = require('https');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const verifySupabaseToken = require('./src/utils/verifySupabaseToken');
const multer = require('multer');
dotenv.config();
const app = express();
const PORT = 3001;
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(VIDEO_DIR, 'user-uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Sanitize the filename or generate unique names if needed
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'video/mp4') {
      cb(null, true);
    } else {
      cb(new Error('Only MP4 files are allowed'));
    }
  }
});

app.post('/api/upload-game', upload.single('video'), async (req, res) => {
  const { date, players, team_name } = req.body;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No video file uploaded' });
  }

  if (!date || !players) {
    return res.status(400).json({ success: false, message: 'Missing date or players field' });
  }

  const { data: existingGames, error } = await supabase
    .from('games')
    .select('id')
    .eq('date', date);

  if (error) {
    console.error('Supabase query failed:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }

  const count = existingGames.length;
  const gameNumber = count + 1;
  const ext = path.extname(req.file.originalname); 
  const baseFileName = `${date}_Game${gameNumber}`;
  const originalFileName = `${baseFileName}_original${ext}`;
  const processedFileName = `${baseFileName}_h.264${ext}`; 
  const uploadDir = path.join(VIDEO_DIR, 'user-uploads');
  const oldPath = path.join(uploadDir, req.file.filename);
  const newPath = path.join(uploadDir, originalFileName);

  fs.renameSync(oldPath, newPath);

  console.log(`Saved uploaded file as: ${originalFileName}`);

  // Insert into Supabase Games Table
  const { data: insertedGame, error: insertError } = await supabase
    .from('games')
    .insert([
      {
        date: date,
        title: `${date} Game ${gameNumber}`,
        video_url: processedFileName,
        players: players.split(',').map(p => p.trim()),
        team_name: team_name
      }
    ])
    .select()
    .single();

  if (insertError) {
    console.error('Failed to insert game into Supabase:', insertError);
    return res.status(500).json({ success: false, message: 'Failed to create game record' });
  }

  return res.json({ success: true, filename: processedFileName });
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


app.patch('/api/update-game/:id', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Missing token' });

  const decoded = verifySupabaseToken(token);
  if (!decoded || decoded.user_metadata?.role !== 'admin') {
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

const options = {
  key: fs.readFileSync('./cert/key.pem'),
  cert: fs.readFileSync('./cert/cert.pem'),
};

https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
  console.log(`HTTPS server running on port ${PORT}`);
});
