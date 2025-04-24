import fs from 'fs';
import { generateFeeds } from "./generate";

const writeFile = async () => {
    const resp = await generateFeeds()
    fs.writeFileSync('public/data.json', JSON.stringify(resp, null, 2));
}

writeFile()
