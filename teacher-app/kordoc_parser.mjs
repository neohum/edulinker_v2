import { parse } from "kordoc";
import { readFileSync } from "fs";

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("No file provided");
    process.exit(1);
}

const filePath = args[0];

async function run() {
    try {
        const fileData = readFileSync(filePath);
        const result = await parse(fileData.buffer);
        if (result.success) {
            process.stdout.write(result.markdown || "");
        } else {
            console.error(result.error?.message || "Unknown parsing error");
            process.exit(1);
        }
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

run();
