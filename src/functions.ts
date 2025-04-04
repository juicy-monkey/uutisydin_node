import { OpenAI } from 'openai'
import fs from 'fs';
import path from 'path';
import { NewsCluster, NewsItem, RSSResult } from './interfaces'
import { countBy, orderBy } from 'lodash'

const openai = new OpenAI()


export const parserFn = (rssResult: RSSResult, hours = 48): NewsItem[] => {
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


export const generateEmbeddings = async (items: NewsItem[]): Promise<number[][]> => {
    const texts = items.map((item) => {
        return `${item.title} ${item.content} ${item.categories.join(' ')}`
    })
    const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts
    })
    return res.data.map(d => d.embedding)
}

export const clusterFeeds = async (items: NewsItem[], threshold = 0.6) => {
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
            .filter(category => 
                category !== 'tilaajille' &&
                category !== 'saauutiset' &&
                !category.includes(' ') &&
                !category.includes('-')
            )
            .slice(0, 3)
            .map(category => {
                if (category === 'eu') {
                    return 'EU'
                }
                return category.charAt(0).toUpperCase() + category.slice(1)
            })

        clusters.push({
            mainTitle: '',
            mainCategories: topCategories,
            imageUrl: '',
            relatedNews: cluster,
        })
    }

    const filteredClusters = clusters
        .filter((cluster) => cluster.relatedNews.length > 1)
        .filter((cluster) => {
            // Filter out clusters that only have articles from is or iltalehti
            return cluster.relatedNews.some(item => (item.publisherId !== 'is') && (item.publisherId !== 'iltalehti'))
        })

    const sortedClusters = filteredClusters.map(cluster => ({
        ...cluster,
        relatedNews: cluster.relatedNews.sort((a, b) => b.date.getTime() - a.date.getTime())
    }))
    sortedClusters.sort((a, b) => {
        const aLatest = a.relatedNews[0]?.date.getTime() || 0
        const bLatest = b.relatedNews[0]?.date.getTime() || 0
        return bLatest - aLatest
    })
    return sortedClusters
}

export const cosineSimilarity = (a: number[], b: number[]) => {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0)
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0))
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0))
    return dot / (normA * normB)
}

export const generateClusterTitle = async (items: NewsItem[]) => {
    const texts = items.map((item) => `${item.title} - ${item.content}`)

    const completion: OpenAI.ChatCompletion = await openai.chat.completions.create({
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

export const getSuitableImageUrl = async (items: NewsItem[]) => {
    const texts = items.map((item) => `${item.title} ${item.content} ${item.categories.join(' ')}`).join(' ').toLowerCase()
    const keywords = fs.readdirSync(path.join(__dirname, '../public/images')).filter(d => d != '.DS_Store');

    const keywordFrequencies = keywords.reduce((acc, keyword) => {
        const regex = new RegExp(keyword, 'g')
        const matches = texts.match(regex)
        acc[keyword] = matches ? matches.length : 0
        return acc
    }, {} as Record<string, number>)

    // console.log('---' + items[0].title.toUpperCase())
    // console.log(
    //     Object.entries(keywordFrequencies)
    //         .sort((a, b) => b[1] - a[1])
    //         .slice(0, 4)
    //         .reduce((acc, [key, val]) => {
    //             acc[key] = val
    //             return acc
    //         }, {} as Record<string, number>)
    // )

    const keyword = Object.entries(keywordFrequencies)
        .sort((a, b) => b[1] - a[1])
        .find(([_, count]) => count > 1)?.[0] || ''

    if (!keyword || !keywords.includes(keyword)) {
        return ''
    }

    const dirPath = path.join(__dirname, '../public/images', keyword)
    const images = fs.readdirSync(dirPath).filter(file => {
        const ext = path.extname(file).toLowerCase()
        return ['.jpg', '.jpeg', '.png'].includes(ext)
    })

    if (images.length === 0) {
        console.log(`No images found in keyword directory: ${keyword}`)
        return ''
    }

    const randomImage = images[Math.floor(Math.random() * images.length)]
    const imageUrl = `/images/${keyword}/${randomImage}`

    return imageUrl
}