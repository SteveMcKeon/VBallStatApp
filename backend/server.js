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
const TUS_DIR = path.join(VIDEO_DIR, 'user-uploads');
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readJsonSafe = async (p) => {
  try { return JSON.parse(await fsp.readFile(p, "utf8")); }
  catch { return null; }
}; 

async function findTusBasesForGame(gameId) {
  const names = await fsp.readdir(TUS_DIR).catch(() => []);
  const bases = new Set();
  for (const name of names) {
    if (name.startsWith(`${gameId}_SET-`)) {
      const base = name.replace(/(?:_READY)?\.[^.]+$/i, "");
      bases.add(base);
      continue;
    }
    if (name.endsWith(".json")) {
      const info = await readJsonSafe(path.join(TUS_DIR, name));
      if (info?.metadata?.game_id === gameId) {
        bases.add(name.slice(0, -5)); // remove ".json"
      }
    }
  }
  return [...bases];
}
async function deleteTusBase(base, extHint = ".mp4") {
  const candidates = [
    path.join(TUS_DIR, base),
    path.join(TUS_DIR, `${base}.json`),
    path.join(TUS_DIR, `${base}.info`),
    path.join(TUS_DIR, `${base}_READY${extHint}`),
  ];
  for (const p of candidates) {
    try { await fsp.unlink(p); } catch {}
  }
}
async function userCanDeleteGame(userId, teamId) {
  if (!teamId) return false;
  let memberOK = false;
  try {
    const { data, error } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .limit(1);
    if (!error && data?.length) memberOK = true;
  } catch (_) { }
  if (memberOK) return true;
  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("captain_id")
    .eq("id", teamId)
    .maybeSingle();
  return !teamErr && team?.captain_id === userId;
}
async function userCanManageTeam(userId, teamId) {
  if (!teamId || !userId) return false;
  try {
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('captain_id')
      .eq('id', teamId)
      .maybeSingle();
    if (!teamErr && team?.captain_id === userId) return true;
  } catch (_) {}
  return false;
}
async function userCanManageTeam(userId, teamId) {
  if (!teamId || !userId) return false;
  try {
    const { data: team, error } = await supabase
      .from('teams')
      .select('captain_id')
      .eq('id', teamId)
      .maybeSingle();
    if (!error && team?.captain_id === userId) return true;
  } catch {}
  return false;
}

app.get('/api/team-members', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const requesterId = decoded?.sub;
    if (!requesterId) return res.status(403).json({ error: 'Unauthorized' });
    const teamId = String(req.query.team_id || '').trim();
    if (!teamId) return res.status(400).json({ error: 'Missing team_id' });
    const allowed = await userCanManageTeam(requesterId, teamId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const { data: rows, error } = await supabase
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId);
    if (error) return res.status(500).json({ error: 'Failed to load members' });
    const enriched = await Promise.all((rows || []).map(async (m) => {
      try {
        const userRes = await supabase.auth.admin.getUserById(m.user_id);
        const user = userRes.user || userRes.data?.user || null;
        return {
          user_id: m.user_id,
          role: m.role,
          email: user?.email || null,
          full_name: user?.user_metadata?.full_name || user?.user_metadata?.name || null,
          display_name: user?.user_metadata?.display_name || null,
        };
      } catch {
        return { user_id: m.user_id, role: m.role, email: null, full_name: null, display_name: null };
      }
    }));
    enriched.sort((a, b) => {
      const r = String(a.role).localeCompare(String(b.role));
      if (r !== 0) return r;
      const an = (a.full_name || a.display_name || a.email || a.user_id || '').toLowerCase();
      const bn = (b.full_name || b.display_name || b.email || b.user_id || '').toLowerCase();
      return an.localeCompare(bn);
    });
    return res.json({ members: enriched });
  } catch (e) {
    console.error('❌ /api/team-members failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

app.get('/api/search-users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const userId = decoded?.sub;
    if (!userId) return res.status(403).json({ error: 'Unauthorized' });
    const q = String(req.query.q || '').trim();
    const teamId = String(req.query.team_id || '').trim();
    if (q.length < 2) return res.json({ users: [] });
    const allowed = await userCanManageTeam(userId, teamId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const qLower = q.toLowerCase();
    const limit = 8;
    const perPage = 1000;
    let page = 1;
    const matches = [];
    while (matches.length < limit) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error('listUsers error:', error);
        break;
      }
      const users = data?.users || [];
      if (!users.length) break;
      for (const u of users) {
        const email = (u.email || '').toLowerCase();
        const full  = (u.user_metadata?.full_name || u.user_metadata?.name || '').toLowerCase();
        const disp  = (u.user_metadata?.display_name || '').toLowerCase();
        if (email.includes(qLower) || full.includes(qLower) || disp.includes(qLower)) {
          matches.push({
            id: u.id,
            email: u.email,
            full_name: u.user_metadata?.full_name || u.user_metadata?.name || '',
            display_name: u.user_metadata?.display_name || ''
          });
          if (matches.length >= limit) break;
        }
      }
      if (users.length < perPage) break;
      page += 1;
    }
    return res.json({ users: matches.slice(0, limit) });
  } catch (e) {
    console.error('❌ /api/search-users failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});

app.delete("/api/delete-game/:gameId", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Missing token" });
    const decoded = verifySupabaseToken(token);
    const userId = decoded?.sub;
    if (!userId) return res.status(403).json({ success: false, message: "Unauthorized" });
    const gameId = String(req.params.gameId || "");
    if (!UUID_RE.test(gameId)) {
      return res.status(400).json({ success: false, message: "Invalid game id" });
    }
    const { data: game, error: gameErr } = await supabase
      .from("games")
      .select("id, team_id, video_url")
      .eq("id", gameId)
      .maybeSingle();
    if (gameErr) {
      console.error("load game failed:", gameErr);
      return res.status(500).json({ success: false, message: "Failed to load game" });
    }
    if (!game) return res.status(404).json({ success: false, message: "Game not found" });
    const allowed = await userCanDeleteGame(userId, game.team_id);
    if (!allowed) return res.status(403).json({ success: false, message: "Forbidden" });
    const ext = path.extname(game.video_url || "") || ".mp4";
    const tusBases = await findTusBasesForGame(gameId);
    for (const base of tusBases) {
      await deleteTusBase(base, ext);
    }
    const { error: delErr } = await supabase.from("games").delete().eq("id", gameId);
    if (delErr) {
      console.error("DB delete failed:", delErr);
      return res.status(500).json({ success: false, message: "Database delete failed" });
    }
    return res.json({ success: true, removedTus: tusBases.length });
  } catch (e) {
    console.error("❌ delete-game failed:", e);
    return res.status(500).json({ success: false, message: "Unexpected server error" });
  }
});

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
