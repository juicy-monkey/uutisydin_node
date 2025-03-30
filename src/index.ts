import express from 'express'
import cors from 'cors';
import Parser from 'rss-parser'
import { OpenAI } from 'openai'
import { countBy, orderBy } from 'lodash'

const PORT = 8080
const app = express()
app.use(express.json())
app.use(cors());

const parser = new Parser()
const openai = new OpenAI()

interface RSSFeed {
    publisherId: string,
    publisher: string,
    publisherUrl: string,
    rssUrl: string,
}

interface RSSResult {
    feed: RSSFeed,
    results: any
}

interface NewsItem {
    publisherId: string,
    publisher: string,
    publisherUrl: string,
    title: string,
    content: string,
    date: Date,
    categories: string[],
    link: string
}

interface NewsCluster {
    mainTitle: string,
    mainCategories: string[],
    relatedNews: NewsItem[],
}

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

////////////////////////////////////////////////////////


const parserFn = (rssResult: RSSResult, hours = 48): NewsItem[] => {
    const now = new Date()
    const cutoffTime = new Date(now.getTime() - 60 * 60 * 1000 * hours)

    const items = rssResult.results.items

    return items
        .map(item => ({
            publisherId: rssResult.feed.publisherId,
            publisher: rssResult.feed.publisher,
            publisherUrl: rssResult.feed.publisherUrl,
            title: item.title || '',
            content: item.content || item.contentSnippet || '',
            date: new Date(item.pubDate || item.isoDate || ''),
            categories: (item.categories || []).map(c => c.toLowerCase()),
            link: item.link || item.guid || ''
        }))
        .filter(news => news.date > cutoffTime)
}


const generateEmbeddings = async (items: NewsItem[]): Promise<number[][]> => {
    const texts = items.map((item) => {
        return `${item.title} ${item.content} ${item.categories.join(' ')}`
    })
    const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts
    })
    return res.data.map(d => d.embedding)
}

const clusterFeeds = async (items: NewsItem[], threshold = 0.6) => {
    const embeddings = await generateEmbeddings(items)
    const clusters: NewsCluster[] = []
    const visited = new Set<number>()

    for (let i = 0; i < items.length; i++) {
        if (visited.has(i)) continue
        visited.add(i)

        const cluster = [items[i]]
        for (let j = i + 1; j < items.length; j++) {
            if (visited.has(j)) continue
            const sim = cosineSimilarity(embeddings[i], embeddings[j])
            if (sim > threshold) {
                cluster.push(items[j])
                visited.add(j)
            }
        }

        const allCategories = cluster.flatMap(item => item.categories || [])
        const categoryCounts = countBy(allCategories)
        const sortedCategories = orderBy(Object.entries(categoryCounts), ([, count]) => count, 'desc')
        const topCategories = sortedCategories
            .map(([category]) => category)
            .filter(category => category !== 'tilaajille' && category !== 'saauutiset' && !category.includes(' '))
            .slice(0, 3)
            .map(category => category.charAt(0).toUpperCase() + category.slice(1))
        
        clusters.push({
            mainTitle: '',
            mainCategories: topCategories,
            relatedNews: cluster,
        })
    }

    return clusters
}

const cosineSimilarity = (a: number[], b: number[]) => {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
    return dot / (normA * normB)
}

const generateClusterTitle = async (items: NewsItem[]) => {
    const texts = items.map((item) => `${item.title} - ${item.content}`)

    const completion: OpenAI.ChatCompletion =  await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.0,
        top_p: 0.0,
        messages: [
        {
            role: 'system',
            content: `
            Olet uutistoimittaja.
            Sinulle annetaan vähintään kahden uutisartikkelin otsikko ja mahdollisesti niiden ingressi.
            Tehtäväsi on analysoida ne ja tiivistää niiden keskeinen sisältö yhdeksi ytimekkääksi, neutraaliksi otsikoksi, jossa on korkeintaan kuusi sanaa.
            Otsikon tulee olla informatiivinen, ytimekäs ja uskollinen alkuperäiselle sisällölle.
            Otsikon tulee olla hyvää suomenkieltä ja sanajärjestys on oltava kieliopillisesti oikein.
            On tärkeää, että otsikko ei harhaanjohda tai ole monitulkintainen.
            Vastaa vain otsikko, älä mitään muuta.

            Otsikot ja ingressit:
            ${texts.join('\n')}`
        }],
    })
    return completion.choices[0].message.content!
}


/////////////////// ROUTES ///////////////////
app.get('/feeds', async (req, res) => {
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
        res.json({
            successCount: successfulFeeds.length,
            failureCount: failedFeeds.length,
            failedFeeds,
            feeds: clustersWithTitle
        })

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