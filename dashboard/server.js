import express from 'express';
import { MongoClient } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const MONGO_URL = "mongodb://127.0.0.1:27017";
const DB_NAME = "StateOfDecay_VN";
const COLLECTION_NAME = "translations";

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let db, collection;

async function connectDB() {
    try {
        const client = new MongoClient(MONGO_URL);
        await client.connect();
        db = client.db(DB_NAME);
        collection = db.collection(COLLECTION_NAME);
        console.log("Connected to MongoDB");
    } catch (err) {
        console.error("Failed to connect to MongoDB", err);
        process.exit(1);
    }
}

// API: Get Stats
app.get('/api/stats', async (req, res) => {
    try {
        const total = await collection.countDocuments();
        const btxtCount = await collection.countDocuments({ buildMethod: "BTXT (Python)" });
        const bmdCount = await collection.countDocuments({ buildMethod: "BMD (Node.js)" });
        
        res.json({
            total,
            btxtCount,
            bmdCount,
            progress: 100 // assuming all in DB are translated or 'final'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get Translations (with search and pagination)
app.get('/api/translations', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const buildMethod = req.query.buildMethod || '';

        let query = {};
        if (search) {
            query.$or = [
                { sourceText: { $regex: search, $options: 'i' } },
                { translatedText: { $regex: search, $options: 'i' } }
            ];
        }
        if (buildMethod) {
            query.buildMethod = buildMethod;
        }

        const items = await collection.find(query)
                                      .skip(skip)
                                      .limit(limit)
                                      .toArray();
        const totalItems = await collection.countDocuments(query);

        res.json({
            items,
            page,
            totalPages: Math.ceil(totalItems / limit),
            totalItems
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Dashboard running at http://localhost:${port}`);
    });
});
