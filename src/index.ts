import express from 'express'
import Parser from 'rss-parser'
import { OpenAI } from 'openai'

const PORT = 8080
const app = express()
app.use(express.json())

const parser = new Parser()
const openai = new OpenAI()

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

interface NewsItem {
    title: string,
    content: string,
    date: Date,
    publisher: string,
    categories: string[],
    link: string
}

const parserFn = (publisher: string, items: Parser.Item[]): NewsItem[] => {
    return items.map(item => ({
        publisher,
        title: item.title || '',
        content: item.content || item.contentSnippet || '',
        date: new Date(item.isoDate || item.pubDate || ''),
        categories: item.categories || [],
        link: item.link || item.guid || ''
    }))
}

app.get('/rss', async (req, res) => {
    try {
        // Create promises for each RSS link
        const fetchPromises = RSS_FEEDS.map(async (feed) => {
            const feedResult = await parser.parseURL(feed.url)
            console.log(`✅ Fetched from: ${feed.url} - Items: ${feedResult.items.length}`)

            return {
                publisher: feed.publisher,
                url: feed.url,
                result: feedResult
            }
        })

        // Resolve all promises
        const results = await Promise.allSettled(fetchPromises)

        // Separate resolved promises to failed and successful
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

        // Parse feeds to be in same form
        const feeds = successfulFeeds.flatMap((feed) => {
            return parserFn(feed.publisher, feed.result.items)
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