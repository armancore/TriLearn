const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'EduNexus backend is running! 🚀' })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`EduNexus server running on port ${PORT}`)
})