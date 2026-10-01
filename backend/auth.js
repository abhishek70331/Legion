const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long.");
}

const TOKEN_EXPIRES_IN = "8h";
const JWT_ISSUER = "legion-api";
const JWT_AUDIENCE = "legion-frontend";

function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role
        },
        JWT_SECRET,
        {
            expiresIn: TOKEN_EXPIRES_IN,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        }
    );
}

function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required" });
    }

    const token = header.slice(7);

    try {
        req.user = jwt.verify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        });
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired login session" });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
    }
    next();
}

module.exports = {
    hashPassword,
    comparePassword,
    createToken,
    requireAuth,
    requireAdmin
};
