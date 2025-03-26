import express from 'express'
import Parser from 'rss-parser'
import { NewsItem } from './interfaces'
import { OpenAI } from 'openai'

const openai = new OpenAI()


const PORT = 8080
const app = express()
app.use(express.json())
const parser = new Parser()

const RSS_FEEDS = [
    'https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss',
    'https://www.hs.fi/rss/suomi.xml',
    'https://www.hs.fi/rss/maailma.xml',
    'https://www.hs.fi/rss/talous.xml',
    'https://www.hs.fi/rss/politiikka.xml',
    'https://www.is.fi/rss/kotimaa.xml',
    'https://www.is.fi/rss/politiikka.xml',
    'https://www.is.fi/rss/taloussanomat.xml',
    'https://www.is.fi/rss/ulkomaat.xml',
    'https://www.iltalehti.fi/rss/uutiset.xml',
    'https://www.ts.fi/rss.xml',
    'https://feeds.kauppalehti.fi/rss/main',
    'https://www.kaleva.fi/feedit/rss/managed-listing/kotimaa/',
    'https://www.kaleva.fi/feedit/rss/managed-listing/ulkomaat/',
]

////////////////////////////////////////////////////////
const news: NewsItem[] = []

app.get('/rss', async (req, res) => {
    try {
        const fetchPromises = RSS_FEEDS.map(async (url) => {
            const feed = await parser.parseURL(url)
            console.log(`✅ Fetched from: ${url} - Items: ${feed.items.length}`)

            // feed.items.forEach(item => {
            //     news.push({
            //         title: item.title || '',
            //         link: item.link || '',
            //         pubDate: item.pubDate || '',
            //         content: item.content || '',
            //         contentSnippet: item.contentSnippet || '',
            //         isoDate: item.isoDate || '',
            //         creator: item.creator || '',
            //         categories: item.categories || []
            //     } as NewsItem)
            // })

            return { url, feed }
        })

        const results = await Promise.allSettled(fetchPromises)

        const successfulFeeds = results
            .filter(result => result.status === 'fulfilled')
            .map(result => (result as PromiseFulfilledResult<any>).value)

        const failedFeeds = results
            .filter(result => result.status === 'rejected')
            .map(result => ({
                url: RSS_FEEDS[results.indexOf(result)],
                reason: (result as PromiseRejectedResult).reason
            }))

        console.log(`✅ Successfully fetched ${successfulFeeds.length} feeds.`)
        if (failedFeeds.length) {
            console.warn(`⚠️ ${failedFeeds.length} feeds failed:`, failedFeeds.map(f => f.url))
        }

        res.json({
            message: 'RSS fetch process completed',
            successCount: successfulFeeds.length,
            failureCount: failedFeeds.length,
            failedFeeds,
            feeds: successfulFeeds
        })
    } catch (error) {
        console.error('❌ Unexpected error during RSS fetching:', error)
        res.status(500).json({ error: 'Unexpected error during RSS fetching' })
    }
})

app.get('/', (req, res) => {
    res.send('OK')
})


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})