import Parser from 'rss-parser'
import { NewsItem, RSSFeed, RSSResult } from './interfaces';
import { clusterFeeds as createNewsClusters, generateClusterTitle, getSuitableImageUrl, parserFn } from './functions';

const parser = new Parser()

const RSS_FEEDS: RSSFeed[] = [
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss' },
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-34837' },  // Kotimaa
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-34953' },  // Ulkomaat
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-19274' },  // Talous
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-38033' },  // Politiikka
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-819' },    // Tiede
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-35354' },  // Luonto
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-35138' },  // Terveys
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-35057' },  // Media
    { publisherId: 'yle', publisher: 'Yle', publisherUrl: 'yle.fi', rssUrl: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-12' },     // Liikenne
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

export const generateFeeds = async () => {
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

        console.log(`⌛ Parsing the news feeds and removing duplicates`)
        const seenLinks = new Set<string>() // For removing duplicates based on link
        const feeds: NewsItem[] = successfulFeeds
            .flatMap((feed) => parserFn(feed))
            .filter(item => {
                if (seenLinks.has(item.link)) return false
                seenLinks.add(item.link)
                return true
            })

        console.log(`✨ Creating clusters, filtering and sorting them`)
        const clusters = await createNewsClusters(feeds)

        console.log(`✍️🖼️ Generate titles and find most suitable images for the clusters`)
        const clusterFeeds = await Promise.all(
            clusters.map(async (cluster) => {
                cluster.mainTitle = await generateClusterTitle(cluster.relatedNews)
                cluster.imageUrl = await getSuitableImageUrl(cluster.relatedNews)
                return cluster
            })
        )

        console.log(`✅ Done`)

        const response = {
            timestamp: new Date().toISOString(),
            successCount: successfulFeeds.length,
            failureCount: failedFeeds.length,
            failedFeeds,
            feeds: clusterFeeds
        }

        return response

    } catch (error) {
        console.error('❌ Unexpected error:', error)
        process.exit(1)
    }
}
