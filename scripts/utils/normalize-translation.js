import fs from "fs";
import path from "path";

function removeDiacritics(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

function utf8ByteLength(value) {
    return Buffer.byteLength(String(value ?? ""), "utf8");
}

const OUTPUT_BATCH_FILE = path.resolve('jobs', 'output_batch.json');
const INPUT_BATCH_FILE = path.resolve('jobs', 'input_batch.json');

if (!fs.existsSync(OUTPUT_BATCH_FILE) || !fs.existsSync(INPUT_BATCH_FILE)) {
    console.error("Missing input_batch.json or output_batch.json");
    process.exit(1);
}

const inputs = JSON.parse(fs.readFileSync(INPUT_BATCH_FILE, 'utf8'));
const outputs = JSON.parse(fs.readFileSync(OUTPUT_BATCH_FILE, 'utf8'));

let fixedCount = 0;

for (let i = 0; i < outputs.length; i++) {
    const outJob = outputs[i];
    const inJob = inputs.find(j => j.id === outJob.id);
    if (!inJob) continue;

    for (let j = 0; j < outJob.strings.length; j++) {
        const outStr = outJob.strings[j];
        const inStr = inJob.strings.find(s => s.source === outStr.source);
        if (!inStr) continue;

        let currentBytes = utf8ByteLength(outStr.translation);
        if (currentBytes > inStr.maxUtf8Bytes) {
            // Try removing diacritics
            let noDiacritics = removeDiacritics(outStr.translation);
            if (utf8ByteLength(noDiacritics) <= inStr.maxUtf8Bytes) {
                outStr.translation = noDiacritics;
                fixedCount++;
            } else {
                // Truncate at UTF-8 boundary
                let buf = Buffer.from(noDiacritics, 'utf8');
                let truncated = buf.slice(0, inStr.maxUtf8Bytes).toString('utf8');
                // Remove trailing replacement character if sliced mid-character
                truncated = truncated.replace(/\ufffd/g, '');
                outStr.translation = truncated;
                fixedCount++;
            }
        }
    }
}

fs.writeFileSync(OUTPUT_BATCH_FILE, JSON.stringify(outputs, null, 2));
console.log(`Normalized ${fixedCount} strings to fit maxUtf8Bytes.`);
