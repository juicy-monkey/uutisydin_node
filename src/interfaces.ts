export interface RSSFeed {
    publisherId: string,
    publisher: string,
    publisherUrl: string,
    rssUrl: string,
}

export interface RSSResult {
    feed: RSSFeed,
    results: any
}

export interface NewsItem {
    publisherId: string,
    publisher: string,
    publisherUrl: string,
    title: string,
    content: string,
    date: Date,
    categories: string[],
    link: string
}

export interface NewsCluster {
    mainTitle: string,
    mainCategories: string[],
    relatedNews: NewsItem[],
}