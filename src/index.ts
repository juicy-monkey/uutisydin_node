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
    { publisher: 'yle', url: 'https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss' },
    { publisher: 'hs', url: 'https://www.hs.fi/rss/suomi.xml' },
    { publisher: 'hs', url: 'https://www.hs.fi/rss/maailma.xml' },
    { publisher: 'hs', url: 'https://www.hs.fi/rss/talous.xml' },
    { publisher: 'hs', url: 'https://www.hs.fi/rss/politiikka.xml' },
    { publisher: 'is', url: 'https://www.is.fi/rss/kotimaa.xml' },
    { publisher: 'is', url: 'https://www.is.fi/rss/politiikka.xml' },
    { publisher: 'is', url: 'https://www.is.fi/rss/taloussanomat.xml' },
    { publisher: 'is', url: 'https://www.is.fi/rss/ulkomaat.xml' },
    { publisher: 'iltalehti', url: 'https://www.iltalehti.fi/rss/uutiset.xml' },
    { publisher: 'ts', url: 'https://www.ts.fi/rss.xml' },
    { publisher: 'kauppalehti', url: 'https://feeds.kauppalehti.fi/rss/main' },
    { publisher: 'kaleva', url: 'https://www.kaleva.fi/feedit/rss/managed-listing/kotimaa/' },
    { publisher: 'kaleva', url: 'https://www.kaleva.fi/feedit/rss/managed-listing/ulkomaat/' },
]

////////////////////////////////////////////////////////
const news: NewsItem[] = []

// Parser function type
type PublisherParser = (items: Parser.Item[]) => NewsItem[]

// Placeholder: map of publisher -> custom parser function
const publisherParsers: Record<string, PublisherParser> = {
    yle: (items) => {
        // TODO: implement proper YLE parser
        console.log('Parsing YLE items')
        return []
    },
    hs: (items) => {
        // TODO: implement proper HS parser
        console.log('Parsing HS items')
        return []
    },
    is: (items) => {
        console.log('Parsing IS items')
        return []
    },
    iltalehti: (items) => {
        console.log('Parsing Iltalehti items')
        return []
    },
    ts: (items) => {
        console.log('Parsing TS items')
        return []
    },
    kauppalehti: (items) => {
        console.log('Parsing Kauppalehti items')
        return []
    },
    kaleva: (items) => {
        console.log('Parsing Kaleva items')
        return []
    }
}

app.get('/rss', async (req, res) => {
    try {
        const fetchPromises = RSS_FEEDS.map(async (feed) => {
            const feedResult = await parser.parseURL(feed.url)
            console.log(`✅ Fetched from: ${feed.url} - Items: ${feedResult.items.length}`)

            return {
                publisher: feed.publisher,
                url: feed.url,
                result: feedResult }
        })

        const results = await Promise.allSettled(fetchPromises)
        const failedFeeds = results
            .filter(result => result.status === 'rejected')
            .map(result => ({
                url: RSS_FEEDS[results.indexOf(result)],
                reason: (result as PromiseRejectedResult).reason
            }))

        const successfulFeeds = results
            .filter(result => result.status === 'fulfilled')
            .map(result => (result as PromiseFulfilledResult<any>).value)

        console.log(`✅ Successfully fetched ${successfulFeeds.length} feeds.`)
        if (failedFeeds.length) {
            console.warn(`⚠️ ${failedFeeds.length} feeds failed:`, failedFeeds.map(f => f.url))
        }

        const feeds = successfulFeeds.map((feed) => {
            console.log('NEWS:' + JSON.stringify(feed.publisher))
            const parserFn = publisherParsers[feed.publisher]
            const parsedItems = parserFn(feed.result)
            return feed.result
        })

        res.json({
            message: 'RSS fetch process completed',
            successCount: successfulFeeds.length,
            failureCount: failedFeeds.length,
            failedFeeds,
            feeds
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