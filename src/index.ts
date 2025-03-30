import express from 'express'
import cors from 'cors';
import fs from 'fs';
import Parser from 'rss-parser'
import { NewsItem, RSSFeed, RSSResult } from './interfaces';
import { clusterFeeds, generateClusterTitle, parserFn } from './functions';

const PORT = 8080
const app = express()
app.use(express.json())
app.use(cors());

const parser = new Parser()

const RSS_FEEDS: RSSFeed[] = [
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss' },
    { publisherId: 'hs', publisher: 'Helsingin Sanomat', publisherUrl: 'hs.fi', rssUrl: 'https://www.hs.fi/rss/suomi.xml' },
    { publisherId: 'hs', publisher: 'Helsingin Sanomat', publisherUrl: 'hs.fi', rssUrl: 'https://www.hs.fi/rss/maailma.xml' },
    { publisherId: 'hs', publisher: 'Helsingin Sanomat', publisherUrl: 'hs.fi', rssUrl: 'https://www.hs.fi/rss/talous.xml' },
    { publisherId: 'hs', publisher: 'Helsingin Sanomat', publisherUrl: 'hs.fi', rssUrl: 'https://www.hs.fi/rss/politiikka.xml' },
    { publisherId: 'is', publisher: 'Ilta-Sanomat', publisherUrl: 'is.fi', rssUrl: 'https://www.is.fi/rss/kotimaa.xml' },
    { publisherId: 'is', publisher: 'Ilta-Sanomat', publisherUrl: 'is.fi', rssUrl: 'https://www.is.fi/rss/taloussanomat.xml' },
    { publisherId: 'is', publisher: 'Ilta-Sanomat', publisherUrl: 'is.fi', rssUrl: 'https://www.is.fi/rss/ulkomaat.xml' },
    { publisherId: 'iltalehti', publisher: 'Iltalehti', publisherUrl: 'iltalehti.fi', rssUrl: 'https://www.iltalehti.fi/rss/uutiset.xml' },
    { publisherId: 'ts', publisher: 'Turun Sanomat', publisherUrl: 'ts.fi', rssUrl: 'https://www.ts.fi/rss.xml' },
    { publisherId: 'kauppalehti', publisher: 'Kauppalehti', publisherUrl: 'kauppalehti.fi', rssUrl: 'https://feeds.kauppalehti.fi/rss/main' },
    { publisherId: 'kaleva', publisher: 'Kaleva', publisherUrl: 'kaleva.fi', rssUrl: 'https://www.kaleva.fi/feedit/rss/managed-listing/kotimaa/' },
    { publisherId: 'kaleva', publisher: 'Kaleva', publisherUrl: 'kaleva.fi', rssUrl: 'https://www.kaleva.fi/feedit/rss/managed-listing/ulkomaat/' },
]

app.get('/api/feeds', async (req, res) => {
    try {
        // Create promises for each RSS link
        const fetchPromises = RSS_FEEDS.map(async (feed): Promise<RSSResult> => {
            const results = await parser.parseURL(feed.rssUrl)
            console.log(`🌐 Fetched from: ${feed.rssUrl} - Items: ${results.items.length}`)

            return { feed, results }
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
            .map(result => (result as PromiseFulfilledResult<RSSResult>).value)

        console.log(`🌐 Successfully fetched ${successfulFeeds.length} feeds.`)
        if (failedFeeds.length) {
            console.warn(`⚠️ ${failedFeeds.length} feeds failed:`, failedFeeds)
        }

        console.log(`⌛ Parsing the news feeds`)
        const feeds: NewsItem[] = successfulFeeds.flatMap((feed) => parserFn(feed))

        console.log(`✨ Creating clusters, filtering and sorting them`)
        const clusters = await clusterFeeds(feeds)
        const filteredClusters = clusters.filter((cluster) => cluster.relatedNews.length > 2)

        const sortedClusters = filteredClusters.map(cluster => ({
            ...cluster,
            relatedNews: cluster.relatedNews.sort((a, b) => b.date.getTime() - a.date.getTime())
        }))
        sortedClusters.sort((a, b) => {
            const aLatest = a.relatedNews[0]?.date.getTime() || 0
            const bLatest = b.relatedNews[0]?.date.getTime() || 0
            return bLatest - aLatest
        })

        console.log(`✍️ Generate titles for the clusters`)
        const clustersWithTitle = await Promise.all(
            sortedClusters.map(async (cluster) => {
                cluster.mainTitle = await generateClusterTitle(cluster.relatedNews)
                return cluster
            })
        )

        console.log(`✅ Done`)

        const response = {
            timestamp: new Date().toISOString(),
            successCount: successfulFeeds.length,
            failureCount: failedFeeds.length,
            failedFeeds,
            feeds: clustersWithTitle
        }

        fs.writeFileSync('public/data.json', JSON.stringify(response, null, 2));
        res.json(response)

    } catch (error) {
        console.error('❌ Unexpected error:', error)
        res.status(500).json({ error: 'Unexpected error' })
    }
})

app.get('/', (req, res) => {
    res.send('OK')
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})