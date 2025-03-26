import express from 'express'
import Parser from 'rss-parser'
import { NewsItem } from './interfaces'
import { OpenAI } from 'openai'

const openai = new OpenAI()


const PORT = 8080
const app = express()
app.use(express.json())
const parser = new Parser()

const YLE_RSS = 'https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss'

// const HS_RSS = 'https://www.hs.fi/rss/teasers/etusivu.xml'  // Exclude tilaajille
const HS_FIN = 'https://www.hs.fi/rss/suomi.xml'  // Exclude tilaajille
const HS_WORLD = 'https://www.hs.fi/rss/maailma.xml'  // Exclude tilaajille
const HS_ECONOMICS = 'https://www.hs.fi/rss/talous.xml'  // Exclude tilaajille
const HS_POLITICS = 'https://www.hs.fi/rss/politiikka.xml'  // Exclude tilaajille

const IS_FIN = 'https://www.is.fi/rss/kotimaa.xml'
const IS_POLITICS = 'https://www.is.fi/rss/politiikka.xml'
const IS_ECONOMICS = 'https://www.is.fi/rss/taloussanomat.xml'
const IS_ABROAD = 'https://www.is.fi/rss/ulkomaat.xml'

const IL = 'https://www.iltalehti.fi/rss/uutiset.xml'

const TS = 'https://www.ts.fi/rss.xml'
const KL = 'https://feeds.kauppalehti.fi/rss/main'
const KALEVA_FIN = 'https://www.kaleva.fi/feedit/rss/managed-listing/kotimaa/'
const KALEVA_ABROAD = 'https://www.kaleva.fi/feedit/rss/managed-listing/ulkomaat/'
const TRE = 'https://tampereenseutu.fi/category/uutiset/feed/'

////////////////////////////////////////////////////////
const news: NewsItem[] = []

app.get('/rss', async (req, res) => {

    // const completion: OpenAI.ChatCompletion =  await openai.chat.completions.create({
    //     model: 'gpt-4o-mini',
    //     messages: [
    //     {
    //         role: 'system',
    //         content: `Kerro vitsi, käytä enintään 20 sanaa.`
    //     }],
    // })
    // console.log(completion.choices[0].message.content!)

    try {
        const feed = await parser.parseURL(YLE_RSS)
        console.log(JSON.stringify(feed))
        res.json(feed)
    } catch (error) {
        console.error('Error fetching RSS feed:', error)
        res.status(500).json({ error: 'Failed to fetch RSS feed' })
    }
})

app.get('/', (req, res) => {
    res.send('OK')
})


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})