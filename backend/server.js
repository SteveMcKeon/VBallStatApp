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
app.set('trust proxy', true);
const EXPRESSPORT = 3001;
const VIDEO_DIR = '/app/videos';
const TUS_DIR = path.join(VIDEO_DIR, 'user-uploads');
const crypto = require('crypto');
const VIDEO_TOKEN_SECRET = process.env.VIDEO_TOKEN_SECRET;
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
function signVideoToken(payload, ttlSec = 600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = Buffer.from(JSON.stringify({ ...payload, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', VIDEO_TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyVideoToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', VIDEO_TOKEN_SECRET).update(body).digest('base64url');
  if (want !== sig) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
function requireInternal(req, res, next) {
  const headerKey = req.headers['x-internal-key'] || '';
  const envLen = (process.env.INTERNAL_API_KEY || '').length;
  const ok = envLen > 0 && headerKey === process.env.INTERNAL_API_KEY;
  if (ok) return next();
  return res.status(403).json({ success: false, message: 'Forbidden (internal key required)' });
}
const fsp = require('fs/promises');
function getClientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    req.connection?.remoteAddress ||
    null
  );
}
function getUserIdFromAuth(req) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;
    const decoded = verifySupabaseToken(token);
    return decoded?.sub || null;
  } catch {
    return null;
  }
}
function safePreview(body, max = 2000) {
  try {
    const str = typeof body === 'string' ? body : JSON.stringify(body);
    return str.length > max ? str.slice(0, max) + '…' : str;
  } catch {
    return '[unserializable]';
  }
}
app.use((req, res, next) => {
  const start = Date.now();
  const reqId = req.headers['cf-ray'] || crypto.randomUUID();
  const ip = getClientIp(req);
  const wantBody = () => {
    const ct = (res.getHeader('Content-Type') || '').toString().toLowerCase();
    return ct.includes('application/json') || ct.startsWith('text/');
  };
  const _json = res.json.bind(res);
  res.json = (body) => {
    if (wantBody()) res.locals.__resBody = safePreview(body);
    return _json(body);
  };
  const _send = res.send.bind(res);
  res.send = (body) => {
    if (wantBody()) res.locals.__resBody = safePreview(body);
    return _send(body);
  };
  res.on('finish', () => {
    const duration = Date.now() - start;
    const uid = getUserIdFromAuth(req);
    const line = {
      t: new Date(start).toISOString(),
      id: reqId,
      ip,
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      dur_ms: duration,
      bytes: Number(res.getHeader('Content-Length')) || undefined,
      uid,
      cf_ray: req.headers['cf-ray'] || undefined,
      ua: req.headers['user-agent'] || undefined,
      res: res.locals.__resBody,
    };
    if (!line.res) delete line.res;
    console.log(JSON.stringify(line));
  });
  next();
});
app.use(cors());
app.use(express.json());
const DEMO_TEAM_ID = process.env.DEMO_TEAM_ID || 'e2e310d6-68b1-47cb-97e4-affd7e56e1a3';
async function deleteTeamCascade(teamId) {
  const { data: games } = await supabase
    .from('games')
    .select('id, video_url')
    .eq('team_id', teamId);
  if (games?.length) {
    for (const g of games) {
      const fname = path.basename(String(g.video_url || ''));
      if (!fname) continue;
      const full = path.join(VIDEO_DIR, fname);
      try {
        await fsp.unlink(full);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
  }
  await supabase.from('stats').delete().eq('team_id', teamId);
  await supabase.from('games').delete().eq('team_id', teamId);
  await supabase.from('team_invites').delete().eq('team_id', teamId);
  await supabase.from('team_members').delete().eq('team_id', teamId);
  await supabase.from('teams').delete().eq('id', teamId);
  return { deletedGames: games?.length || 0 };
}
/** DELETE TEAM (captain only) */
app.post('/api/delete-team', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const requesterId = decoded?.sub;
    if (!requesterId) return res.status(403).json({ error: 'Unauthorized' });
    const teamId = String(req.body?.teamId || '').trim();
    if (!UUID_RE.test(teamId)) {
      return res.status(400).json({ error: 'Invalid teamId' });
    }
    if (DEMO_TEAM_ID && teamId === DEMO_TEAM_ID) {
      return res.status(400).json({ error: "You can't delete the Demo team" });
    }
    const allowed = await userCanManageTeam(requesterId, teamId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const out = await deleteTeamCascade(teamId);
    return res.json({ ok: true, ...out });
  } catch (e) {
    console.error('❌ /api/delete-team failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});
/** DELETE ACCOUNT (self) */
app.post('/api/delete-account', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const userId = decoded?.sub;
    if (!userId) return res.status(403).json({ error: 'Unauthorized' });
    const { data: ownedTeams } = await supabase
      .from('teams')
      .select('id, name')
      .eq('captain_id', userId);
    if (ownedTeams?.length) {
      return res.status(409).json({
        error: 'Captain of one or more teams. Delete or transfer captaincy first.',
        teams: ownedTeams,
      });
    }
    await supabase.from('team_members').delete().eq('user_id', userId);
    let email = null;
    try {
      const r = await supabase.auth.admin.getUserById(userId);
      const u = r.user || r.data?.user || null;
      email = u?.email || null;
    } catch { }
    if (email) await supabase.from('team_invites').delete().eq('email', email);
    await supabase.from('team_invites').delete().eq('invited_by', userId);
    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    if (delErr) return res.status(400).json({ error: delErr.message });
    return res.json({ ok: true });
  } catch (e) {
    console.error('❌ /api/delete-account failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});
app.get('/api/video-exists', async (req, res) => {
  try {
    const rel = String(req.query.p || '').replace(/^\//, '');
    if (!rel) return res.json({ exists: false });
    const base = path.resolve(VIDEO_DIR);
    const full = path.resolve(base, rel);
    if (!full.startsWith(base)) return res.status(400).json({ error: 'bad path' });
    await fsp.access(full);
    return res.json({ exists: true });
  } catch {
    return res.json({ exists: false });
  }
});
app.get('/api/video-token', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const decoded = verifySupabaseToken(token);
  const uid = decoded?.sub;
  if (!uid) return res.status(403).json({ error: 'Unauthorized' });
  const gameId = String(req.query.gameId || '').trim();
  if (!UUID_RE.test(gameId)) return res.status(400).json({ error: 'Invalid gameId' });
  const { data: game } = await supabase.from('games')
    .select('id, team_id, video_url').eq('id', gameId).maybeSingle();
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const allowed = await userCanDeleteGame(uid, game.team_id);
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });
  const rel = String(game.video_url || '').replace(/^\//, '');
  const base = rel.replace(/\.(mp4|m4v|mov)$/i, '');
  return res.json({ token: signVideoToken({ gid: game.id, base }) });
});
function guardVideo(req, res, next) {
  const t = req.query.t || req.query.token;
  const payload = verifyVideoToken(t);
  if (!payload) return res.status(401).end('Unauthorized');
  const rel = req.path.replace(/^\//, '');
  if (!(rel === payload.base || rel.startsWith(payload.base + '.') || rel.startsWith(payload.base + '/'))) {
    return res.status(403).end('Forbidden');
  }
  res.setHeader('Cache-Control', 'private, max-age=3600');
  next();
}
app.use('/videos', guardVideo, express.static(VIDEO_DIR, {
  setHeaders(res, p) {
    if (p.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'private, max-age=30');
    } else if (p.endsWith('.m4s')) {
      res.setHeader('Content-Type', 'video/iso.segment');
      res.setHeader('Cache-Control', 'private, max-age=3600');
    } else if (p.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'private, max-age=3600');
    }
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));
const options = {
  key: fs.readFileSync('./cert/key.pem'),
  cert: fs.readFileSync('./cert/cert.pem'),
};
function buildInviteEmail({ inviterLabel, teamName, actionLink, siteUrl }) {
  const prettyTeam = teamName || 'your volleyball team';
  const host = (() => {
    try { return new URL(siteUrl).host; } catch { return siteUrl || 'the site'; }
  })();
  const subject = `Join ${prettyTeam} on VBallTracker — stats & video viewer`;
  const preheader = `${inviterLabel} invited you to ${prettyTeam}. Click to accept.`;
  const html = `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#f6f7fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
        ${preheader}
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
              <tr>
                <td style="padding:24px 24px 8px;">
                  <h1 style="margin:0;font-size:20px;line-height:1.3;">You’ve been invited</h1>
                  <p style="margin:12px 0 0;color:#374151;font-size:14px;line-height:1.6;">
                    <strong>${inviterLabel}</strong> has invited you to join <strong>${prettyTeam}</strong> on
                    VBallTracker — a volleyball stats tracker & content viewer.
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:24px;">
                  <a href="${actionLink}"
                     style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">
                    Accept invite
                  </a>
                  <p style="margin:16px 0 0;color:#6b7280;font-size:12px;line-height:1.6;">
                    If the button doesn’t work, copy & paste this link:<br>
                    <span style="word-break:break-all;">${actionLink}</span>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 24px;">
                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
                  <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
                    You received this because someone entered your email on ${host}. If this wasn’t you, you can ignore this email.
                  </p>
                </td>
              </tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;margin:12px 0 0;">© ${new Date().getFullYear()} VBallTracker</p>
          </td>
        </tr>
      </table>
    </body>
  </html>`.trim();
  const text =
    `${inviterLabel} invited you to join ${prettyTeam} on VBallTracker.
Accept invite: ${actionLink}
If you didn’t request this, you can ignore this email.`;
  return { subject, html, text };
}
async function readSidecar(id) {
  for (const sfx of ['.json', '.info']) {
    const p = path.join(TUS_DIR, id + sfx);
    try {
      const raw = await fsp.readFile(p, 'utf8');
      return { path: p, data: JSON.parse(raw) };
    } catch (_) { }
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
    try { await fsp.unlink(p); } catch { }
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
    const { data: team, error } = await supabase
      .from('teams')
      .select('captain_id')
      .eq('id', teamId)
      .maybeSingle();
    if (!error && team?.captain_id === userId) return true;
  } catch { }
  return false;
}
app.post('/api/set-display-name', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const requesterId = decoded?.sub;
    if (!requesterId) return res.status(403).json({ error: 'Unauthorized' });
    const { teamId, userId, display_name } = req.body || {};
    const newName = String(display_name || '').trim();
    if (!teamId || !userId || !newName) {
      return res.status(400).json({ error: 'Missing teamId, userId or display_name' });
    }
    const allowed = await userCanManageTeam(requesterId, teamId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const { data: targetRow } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!targetRow) return res.status(400).json({ error: 'User not in team' });
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { display_name: newName },
    });
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true });
  } catch (e) {
    console.error('❌ /api/set-display-name failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});
app.get('/api/team-invites', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const requesterId = decoded?.sub;
    if (!requesterId) return res.status(403).json({ error: 'Unauthorized' });
    const teamId = String(req.query.team_id || '').trim();
    const status = String(req.query.status || 'pending').trim();
    if (!teamId) return res.status(400).json({ error: 'Missing team_id' });
    const allowed = await userCanManageTeam(requesterId, teamId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const q = supabase.from('team_invites')
      .select('email, role, invited_user, created_at')
      .eq('team_id', teamId);
    const { data, error } = await q.order('email', { ascending: true });
    if (error) return res.status(500).json({ error: 'Failed to load invites' });
    return res.json({ invites: data || [] });
  } catch (e) {
    console.error('❌ GET /api/team-invites failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});
app.post('/api/team-invites', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const inviterId = decoded?.sub;
    if (!inviterId) return res.status(403).json({ error: 'Unauthorized' });
    let { email, teamId, role = 'player' } = req.body || {};
    if (!email || !teamId) return res.status(400).json({ error: 'Missing email or teamId' });
    email = String(email).trim();
    const emailRx = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
    if (!emailRx.test(email)) return res.status(400).json({ error: `Email address "${email}" is invalid` });
    if (!['player', 'editor'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const allowed = await userCanManageTeam(inviterId, teamId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const inviteToken = crypto.randomUUID();
    const redirectTo =
      `${process.env.SITE_URL}/accept-invite?team=${encodeURIComponent(teamId)}&token=${encodeURIComponent(inviteToken)}`;
    let existingUser = null;
    try {
      if (typeof supabase.auth.admin.getUserByEmail === 'function') {
        const r = await supabase.auth.admin.getUserByEmail(email);
        existingUser = r.user || r.data?.user || null;
      } else {
        const r = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
        const users = r.users || r.data?.users || [];
        existingUser = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
      }
    } catch {
    }
    if (existingUser) {
      const isConfirmed =
        !!(existingUser.email_confirmed_at || existingUser.confirmed_at);
      if (isConfirmed) {
        const { data: existing } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', teamId)
          .eq('user_id', existingUser.id)
          .maybeSingle();
        if (!existing) {
          const { error: insertMemberErr } = await supabase.from('team_members').insert({
            team_id: teamId,
            user_id: existingUser.id,
            role: 'player',
          });
          if (insertMemberErr) {
            return res.status(400).json({ error: insertMemberErr.message || 'Failed to add member' });
          }
        }
        await supabase.from('team_invites')
          .delete()
          .eq('team_id', teamId)
          .eq('email', email);
        return res.json({ ok: true, addedUserId: existingUser.id });
      } else {
        try {
          if (typeof supabase.auth.admin.resend === 'function') {
            await supabase.auth.admin.resend({ type: 'signup', email, options: { redirectTo } });
          } else {
            await supabase.auth.admin.generateLink({ type: 'signup', email, options: { redirectTo } });
          }
        } catch { /* ignore non-fatal email errors */ }
        await supabase.from('team_invites')
          .delete()
          .eq('team_id', teamId)
          .eq('email', email);
        const { error: insertUnverifiedInviteErr } = await supabase.from('team_invites').insert({
          team_id: teamId,
          email,
          invited_by: inviterId,
          role,
          token: inviteToken,
        });
        if (insertUnverifiedInviteErr) {
          return res.status(400).json({ error: insertUnverifiedInviteErr.message || 'Failed to record invite' });
        }
        return res.json({ ok: true, pending: true });
      }
    }
    const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inviteErr) {
      return res.status(400).json({ error: inviteErr.message || 'Invite failed' });
    }
    await supabase.from('team_invites')
      .delete()
      .eq('team_id', teamId)
      .eq('email', email);
    const { error: insertErr } = await supabase.from('team_invites').insert({
      team_id: teamId,
      email,
      invited_by: inviterId,
      role,
      token: inviteToken,
    });
    if (insertErr) {
      return res.status(400).json({ error: insertErr.message || 'Failed to record invite' });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/team-invites failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});
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
        const avatar_url =
          user?.user_metadata?.avatar_url ||
          user?.user_metadata?.picture ||
          user?.user_metadata?.avatar ||
          user?.user_metadata?.image ||
          user?.identities?.[0]?.identity_data?.avatar_url ||
          null;
        return {
          user_id: m.user_id,
          role: m.role,
          email: user?.email || null,
          full_name: user?.user_metadata?.full_name || user?.user_metadata?.name || null,
          display_name: user?.user_metadata?.display_name || null,
          avatar_url,
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
app.post('/api/display-names', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const requesterId = decoded?.sub;
    if (!requesterId) return res.status(403).json({ error: 'Unauthorized' });
    const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = [...new Set(raw.map(String).filter(id => UUID_RE.test(id)))].slice(0, 200);
    if (ids.length === 0) return res.json({ names: {} });
    const pairs = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await supabase.auth.admin.getUserById(id);
          const u = r.user || r.data?.user || null;
          if (!u) return null;
          const dn =
            u.user_metadata?.display_name ||
            u.user_metadata?.full_name ||
            u.user_metadata?.name ||
            (u.email ? u.email.split('@')[0] : '');
          return dn ? [id, dn] : null;
        } catch {
          return null;
        }
      })
    );
    const names = Object.fromEntries(pairs.filter(Boolean));
    return res.json({ names });
  } catch (e) {
    console.error('/api/display-names failed:', e);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
});
app.get('/api/search-users', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const decoded = verifySupabaseToken(token);
    const requesterId = decoded?.sub;
    if (!requesterId) return res.status(403).json({ error: 'Unauthorized' });
    const q = String(req.query.q || '').trim();
    const teamId = String(req.query.team_id || '').trim();
    if (!teamId) return res.status(400).json({ error: 'Missing team_id' });
    if (q.length < 2) return res.json({ users: [] });
    const allowed = await userCanManageTeam(requesterId, teamId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const qLower = q.toLowerCase();
    const limit = 8;
    const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
      supabase.from('team_members').select('user_id').eq('team_id', teamId),
      supabase.from('team_invites').select('email').eq('team_id', teamId),
    ]);
    const memberIds = new Set((memberRows || []).map(r => r.user_id));
    const inviteEmails = new Set((inviteRows || [])
      .map(r => (r.email || '').toLowerCase())
      .filter(Boolean));
    const { data: myTeams } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', requesterId);
    const myTeamIds = (myTeams || [])
      .map(r => r.team_id)
      .filter(id => id && id !== DEMO_TEAM_ID);
    if (myTeamIds.length === 0) return res.json({ users: [] });
    const { data: coRows } = await supabase
      .from('team_members')
      .select('user_id')
      .in('team_id', myTeamIds);
    const candidateIds = [...new Set((coRows || [])
      .map(r => r.user_id)
      .filter(uid => uid && uid !== requesterId))];
    const matches = [];
    for (const uid of candidateIds) {
      if (matches.length >= limit) break;
      if (memberIds.has(uid)) continue;
      try {
        const userRes = await supabase.auth.admin.getUserById(uid);
        const u = userRes.user || userRes.data?.user || null;
        if (!u) continue;
        const email = (u.email || '').toLowerCase();
        const full = (u.user_metadata?.full_name || u.user_metadata?.name || '').toLowerCase();
        const disp = (u.user_metadata?.display_name || '').toLowerCase();
        if (!(email.includes(qLower) || full.includes(qLower) || disp.includes(qLower))) continue;
        const verified = Boolean(
          u.email_confirmed_at || u.confirmed_at || u.last_sign_in_at || (u.identities?.length)
        );
        if (!verified) continue;
        if (!email) continue;
        if (inviteEmails.has(email)) continue;
        matches.push({
          id: u.id,
          email: u.email,
          full_name: u.user_metadata?.full_name || u.user_metadata?.name || '',
          display_name: u.user_metadata?.display_name || '',
          is_confirmed: true,
          avatar_url:
            u.user_metadata?.avatar_url ||
            u.user_metadata?.picture ||
            u.user_metadata?.avatar ||
            u.user_metadata?.image ||
            u.identities?.[0]?.identity_data?.avatar_url ||
            null,
        });
      } catch {
      }
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
        await fsp.unlink(src).catch(() => { });
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
