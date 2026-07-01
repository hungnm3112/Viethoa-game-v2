import express from "express";
import { MongoClient } from "mongodb";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGODB_DB || "viethoa_sod";

let db;

// Connect to MongoDB
MongoClient.connect(mongoUri)
  .then((client) => {
    console.log("Connected to MongoDB");
    db = client.db(dbName);
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

app.use(express.static(path.join(__dirname, "public")));

// API: Lấy thống kê
app.get("/api/stats", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const translations = db.collection("translations");
    const total = await translations.countDocuments();
    const translatedCount = await translations.countDocuments({ translatedText: { $ne: "" } });
    
    // Aggregation by zone
    const zones = await translations.aggregate([
      {
        $group: {
          _id: "$zone",
          total: { $sum: 1 },
          translated: {
            $sum: { $cond: [{ $ne: ["$translatedText", ""] }, 1, 0] }
          }
        }
      },
      { $sort: { total: -1 } }
    ]).toArray();

    res.json({
      total,
      translated: translatedCount,
      percentage: ((translatedCount / total) * 100).toFixed(2),
      zones: zones.map(z => ({
        name: z._id || "Unknown",
        total: z.total,
        translated: z.translated,
        percentage: ((z.translated / z.total) * 100).toFixed(2)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Lấy danh sách translations có phân trang và tìm kiếm
app.get("/api/translations", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || "";
    const zone = req.query.zone || "";
    const status = req.query.status || ""; // "translated" | "untranslated" | ""

    const query = {};
    if (search) {
      query.$or = [
        { sourceText: { $regex: search, $options: "i" } },
        { translatedText: { $regex: search, $options: "i" } }
      ];
    }
    if (zone) {
      query.zone = zone;
    }
    if (status === "translated") {
      query.translatedText = { $ne: "" };
    } else if (status === "untranslated") {
      query.translatedText = "";
    }

    const translations = db.collection("translations");
    const totalItems = await translations.countDocuments(query);
    const items = await translations
      .find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    res.json({
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Dashboard server running at http://localhost:${port}`);
});
