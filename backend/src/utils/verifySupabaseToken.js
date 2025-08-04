const jwt = require('jsonwebtoken');
require('dotenv').config();

function verifySupabaseToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (err) {
    console.error('Supabase JWT verification failed:', err.message);
    return null;
  }
}

module.exports = verifySupabaseToken;
