import crypto from 'crypto';

const tokens = new Map();
const sessions = new Map();

function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

export const auth = {
  createApiToken(userId, label = 'default') {
    const token = generateToken(32);
    const now = Date.now();
    const tokenData = {
      id: `token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'api',
      token,
      userId,
      label,
      created_at: now,
      expires_at: null,
      active: true
    };
    tokens.set(token, tokenData);
    return tokenData;
  },

  createSessionToken(userId) {
    const token = generateToken(32);
    const now = Date.now();
    const sessionData = {
      id: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'session',
      token,
      userId,
      created_at: now,
      last_activity: now,
      expires_at: now + (24 * 60 * 60 * 1000),
      active: true
    };
    sessions.set(token, sessionData);
    return sessionData;
  },

  verifyToken(token) {
    if (!token) return null;

    let tokenData = tokens.get(token);
    if (tokenData && tokenData.active) {
      if (!tokenData.expires_at || tokenData.expires_at > Date.now()) {
        return tokenData;
      }
      tokenData.active = false;
      return null;
    }

    tokenData = sessions.get(token);
    if (tokenData && tokenData.active) {
      if (tokenData.expires_at > Date.now()) {
        tokenData.last_activity = Date.now();
        return tokenData;
      }
      tokenData.active = false;
      return null;
    }

    return null;
  },

  revokeToken(token) {
    let tokenData = tokens.get(token);
    if (tokenData) {
      tokenData.active = false;
      return true;
    }

    tokenData = sessions.get(token);
    if (tokenData) {
      tokenData.active = false;
      return true;
    }

    return false;
  },

  extractToken(req, url) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'Token')) {
        return parts[1];
      }
    }

    if (url) {
      try {
        const urlObj = new URL(url, 'http://localhost');
        const token = urlObj.searchParams.get('token');
        if (token) return token;
      } catch (_) {}
    }

    return null;
  },

  getTokensForUser(userId) {
    const userTokens = [];
    tokens.forEach(t => {
      if (t.userId === userId) userTokens.push(t);
    });
    sessions.forEach(s => {
      if (s.userId === userId) userTokens.push(s);
    });
    return userTokens;
  },

  cleanup() {
    const now = Date.now();
    for (const [token, data] of sessions.entries()) {
      if (data.expires_at < now) {
        sessions.delete(token);
      }
    }
    for (const [token, data] of tokens.entries()) {
      if (data.expires_at && data.expires_at < now) {
        tokens.delete(token);
      }
    }
  }
};

export default { auth };
