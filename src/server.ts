import express from 'express'
import cors from 'cors';
import { main } from '.';


const PORT = 8080
const app = express()
app.use(express.json())
app.use(cors());

app.get('/api/feeds', async (req, res) => {
    res.json(await main())
})

app.get('/', (req, res) => {
    res.send('OK')
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})
