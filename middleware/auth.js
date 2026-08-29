const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "7d";

function generateToken(adminId, username, role) {
  return jwt.sign(
    { id: String(adminId), username, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

function getTokenFromRequest(req) {
  // Prefer Authorization Bearer (works cross-origin on Vercel)
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  // Cookie fallback (same-site / local)
  if (req.cookies && req.cookies.admin_token) {
    return req.cookies.admin_token;
  }
  return null;
}

function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in.",
      });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session. Please log in again.",
    });
  }
}

function optionalAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.admin = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
      };
    }
  } catch {
    // ignore
  }
  next();
}

module.exports = {
  generateToken,
  requireAuth,
  optionalAuth,
  getTokenFromRequest,
};
