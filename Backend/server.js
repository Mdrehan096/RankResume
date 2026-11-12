require("dotenv").config()
const app = require("./src/app")
const connectToDB = require("./src/config/database")

const PORT = Number(process.env.PORT) || 3000

async function startServer() {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET environment variable is required")
    }
    await connectToDB()
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`)
    })
}

startServer().catch((err) => {
    console.error("Failed to start server:", err.message)
    process.exit(1)
})
