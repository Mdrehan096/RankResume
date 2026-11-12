const crypto = require("crypto")
const userModel = require("../models/user.model")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { z } = require("zod")
const tokenBlacklistModel = require("../models/blacklist.model")

const registerSchema = z.object({
    username: z
        .string({ error: "Username is required" })
        .trim()
        .min(3, "Username must be at least 3 characters")
        .max(40, "Username must be at most 40 characters"),
    email: z
        .string({ error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Please provide a valid email address")
        .max(254, "Email is too long"),
    password: z
        .string({ error: "Password is required" })
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password must be at most 128 characters"),
})

const loginSchema = z.object({
    email: z
        .string({ error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Please provide a valid email address"),
    password: z
        .string({ error: "Password is required" })
        .min(1, "Password is required")
        .max(128, "Password is too long"),
})

function getCookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
    }
}

/**
 * @name registerUserController
 * @description register a new user, expects username, email and password in the request body
 * @access Public
 */
async function registerUserController(req, res, next) {
    try {
        const parsed = registerSchema.safeParse(req.body || {})
        if (!parsed.success) {
            return res.status(400).json({
                message: parsed.error.issues[0]?.message || "Please provide valid username, email and password"
            })
        }

        const { username, email, password } = parsed.data

        const isUserAlreadyExists = await userModel.findOne({
            $or: [{ username }, { email }]
        })

        if (isUserAlreadyExists) {
            return res.status(400).json({
                message: "Account already exists with this email address or username"
            })
        }

        const hash = await bcrypt.hash(password, 10)

        const user = await userModel.create({
            username,
            email,
            password: hash
        })

        const token = jwt.sign(
            { id: user._id, username: user.username, jti: crypto.randomUUID() },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        )

        res.cookie("token", token, getCookieOptions())

        return res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        })
    } catch (err) {
        if (err && err.code === 11000) {
            return res.status(400).json({
                message: "Account already exists with this email address or username"
            })
        }
        return next(err)
    }
}

/**
 * @name loginUserController
 * @description login a user, expects email and password in the request body
 * @access Public
 */
async function loginUserController(req, res, next) {
    try {
        const parsed = loginSchema.safeParse(req.body || {})
        if (!parsed.success) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const { email, password } = parsed.data

        const user = await userModel.findOne({ email })

        if (!user) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const isPasswordValid = await bcrypt.compare(password, user.password)

        if (!isPasswordValid) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, jti: crypto.randomUUID() },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        )

        res.cookie("token", token, getCookieOptions())
        return res.status(200).json({
            message: "User loggedIn successfully.",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        })
    } catch (err) {
        return next(err)
    }
}

/**
 * @name logoutUserController
 * @description clear token from user cookie and add the token in blacklist
 * @access public
 */
async function logoutUserController(req, res, next) {
    try {
        const token = req.cookies?.token

        if (token && typeof token === "string") {
            await tokenBlacklistModel.updateOne(
                { token },
                { $setOnInsert: { token } },
                { upsert: true }
            )
        }

        const { maxAge: _maxAge, ...clearOpts } = getCookieOptions()
        res.clearCookie("token", clearOpts)

        return res.status(200).json({
            message: "User logged out successfully"
        })
    } catch (err) {
        return next(err)
    }
}

/**
 * @name getMeController
 * @description get the current logged in user details.
 * @access private
 */
async function getMeController(req, res, next) {
    try {
        const user = await userModel.findById(req.user.id).select("-password")

        if (!user) {
            return res.status(401).json({
                message: "User account not found."
            })
        }

        return res.status(200).json({
            message: "User details fetched successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
        })
    } catch (err) {
        return next(err)
    }
}

module.exports = {
    registerUserController,
    loginUserController,
    logoutUserController,
    getMeController
}
