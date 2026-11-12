const jwt = require("jsonwebtoken")
const tokenBlacklistModel = require("../models/blacklist.model")

async function authUser(req, res, next) {
    const token = req.cookies?.token

    if (!token || typeof token !== "string") {
        return res.status(401).json({
            message: "Token not provided."
        })
    }

    let decoded
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
        return res.status(401).json({
            message: "Invalid token."
        })
    }

    if (!decoded || !decoded.id) {
        return res.status(401).json({
            message: "Invalid token."
        })
    }

    try {
        const isTokenBlacklisted = await tokenBlacklistModel.findOne({ token })
        if (isTokenBlacklisted) {
            return res.status(401).json({
                message: "token is invalid"
            })
        }
    } catch (err) {
        return next(err)
    }

    req.user = decoded
    next()
}

module.exports = { authUser }
