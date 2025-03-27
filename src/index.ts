import express from 'express'
import cors from 'cors';
import Parser from 'rss-parser'
import { OpenAI } from 'openai'

const PORT = 8080
const app = express()
app.use(express.json())
app.use(cors());

const parser = new Parser()
const openai = new OpenAI()

const RSS_FEEDS = [
    { publisher: 'yle', url: 'https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss' },
    { publisher: 'hs', url: 'https://www.hs.fi/rss/suomi.xml' },
    { publisher: 'hs', url: 'https://www.hs.fi/rss/maailma.xml' },
    { publisher: 'hs', url: 'https://www.hs.fi/rss/talous.xml' },
    { publisher: 'hs', url: 'https://www.hs.fi/rss/politiikka.xml' },
    { publisher: 'is', url: 'https://www.is.fi/rss/kotimaa.xml' },
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

interface NewsCluster {
    mainTitle: string,
    relatedNews: NewsItem[],
}

const parserFn = (publisher: string, items: Parser.Item[], hours = 48): NewsItem[] => {
    const now = new Date()
    const cutoffTime = new Date(now.getTime() - 60 * 60 * 1000 * hours)

    return items
        .map(item => ({
            publisher,
            title: item.title || '',
            content: item.content || item.contentSnippet || '',
            date: new Date(item.pubDate || item.isoDate || ''),
            categories: item.categories || [],
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

        clusters.push({
            mainTitle: '',
            relatedNews: cluster
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
            Sinulle annetaan vähintään kahden uutisartikkelin otsikko ja mahdollisesti niiden ingressi.
            Tehtäväsi on analysoida ne ja tiivistää niiden keskeinen sisältö yhdeksi ytimekkääksi, iskeväksi otsikoksi, jossa on korkeintaan viisi sanaa.
            Otsikon tulee olla informatiivinen ja houkutteleva, mutta silti ytimekäs ja uskollinen alkuperäiselle sisällölle.
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
        const fetchPromises = RSS_FEEDS.map(async (feed) => {
            const feedResult = await parser.parseURL(feed.url)
            console.log(`🌐 Fetched from: ${feed.url} - Items: ${feedResult.items.length}`)

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

        console.log(`🌐 Successfully fetched ${successfulFeeds.length} feeds.`)
        if (failedFeeds.length) {
            console.warn(`⚠️ ${failedFeeds.length} feeds failed:`, failedFeeds.map(f => f.url))
        }

        console.log(`⌛ Parsing the news feeds`)
        const feeds: NewsItem[] = successfulFeeds.flatMap((feed) => {
            return parserFn(feed.publisher, feed.result.items)
        })

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