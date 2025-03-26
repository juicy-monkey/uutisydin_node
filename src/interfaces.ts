export enum Publisher {
    HS = 'HS',
    IL = 'IL',
    IS = 'IS',
    KALEVA = 'KALEVA',
    KL = 'KL',
    TRE = 'TRE',
    TS = 'TS',
    YLE = 'YLE',
}

export interface NewsItem {
    title: string,
    description: string,
    date: Date,
    publishers: Publisher[],
    categories: string[],
    links: string[]
}

