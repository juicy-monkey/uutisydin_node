import fs from 'fs';
import { generateFeeds } from "./generate";

const writeFile = async () => {
    try {
        const resp = await generateFeeds();
        console.log('✍️ Writing file...')
        fs.writeFileSync('public/data.json', JSON.stringify(resp, null, 2));
        console.log('💾 File written successfully. Exiting process.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during execution:', err);
        process.exit(1);
    }
}

writeFile();