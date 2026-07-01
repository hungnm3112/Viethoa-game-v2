import { MongoClient, ObjectId } from "mongodb";
import http from "http";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uri = "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

// Simple byte length calculator
function getUtf8ByteLength(str) {
  if (!str) return 0;
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) len += 1;
    else if (code <= 0x7ff) len += 2;
    else if (code >= 0xd800 && code <= 0xdfff) {
      len += 4;
      i++;
    } else len += 3;
  }
  return len;
}

// Truncate function
function truncateToOriginalBytes(viText, originalLength) {
  if (!viText) return "";
  let truncatedStr = "";
  let currentBytes = 0;
  for (let i = 0; i < viText.length; i++) {
    let charBytes = 0;
    const code = viText.charCodeAt(i);
    if (code <= 0x7f) charBytes = 1;
    else if (code <= 0x7ff) charBytes = 2;
    else if (code >= 0xd800 && code <= 0xdfff) {
      charBytes = 4;
    } else charBytes = 3;

    if (currentBytes + charBytes > originalLength) {
      break;
    }
    truncatedStr += viText[i];
    currentBytes += charBytes;
    if (charBytes === 4) {
      truncatedStr += viText[i+1];
      i++;
    }
  }
  return truncatedStr;
}

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (req.method === "GET" && url.pathname === "/api/strings") {
    try {
      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const zone = url.searchParams.get("zone") || "";
      const search = url.searchParams.get("search") || "";
      const truncatedOnly = url.searchParams.get("truncated") === "true";
      const btxtRule = url.searchParams.get("btxt") === "true"; // If true, don't show truncate warning for Dialog
      
      const sortBy = url.searchParams.get("sortBy") || "_id";
      const sortOrder = url.searchParams.get("order") === "desc" ? -1 : 1;

      const query = {};
      if (zone) query.zone = zone;
      if (search) {
        query.$or = [
          { sourceText: { $regex: search, $options: "i" } },
          { translatedText: { $regex: search, $options: "i" } }
        ];
      }
      if (truncatedOnly) {
        query.isTruncated = true;
      }

      await client.connect();
      const collection = client.db("StateOfDecay_VN").collection("translations");
      const total = await collection.countDocuments(query);
      const items = await collection.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      
      // Post-process items to calculate simulated truncation
      const processedItems = items.map(item => {
        let isDialog = item.zone === "Dialog_Subtitle";
        let shouldTruncate = !isDialog && item.isTruncated;
        let simulatedTruncated = shouldTruncate ? truncateToOriginalBytes(item.translatedText, item.lengthEn) : item.translatedText;

        return {
          ...item,
          simulatedTruncated,
          isDialogZone: isDialog
        };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        items: processedItems
      }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/zones") {
    try {
      await client.connect();
      const collection = client.db("StateOfDecay_VN").collection("translations");
      const zones = await collection.distinct("zone");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(zones));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/strings/update") {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", async () => {
      try {
        const { id, newTextVi } = JSON.parse(body);
        if (!id || newTextVi === undefined) throw new Error("Missing parameters");

        await client.connect();
        const collection = client.db("StateOfDecay_VN").collection("translations");
        
        // Find doc to get original En length
        const doc = await collection.findOne({ _id: new ObjectId(id) });
        if (!doc) throw new Error("Document not found");

        const lengthVi = getUtf8ByteLength(newTextVi);
        const isTooLong = lengthVi > doc.lengthEn;
        
        // Cập nhật
        await collection.updateOne(
          { _id: new ObjectId(id) },
          { 
            $set: { 
              translatedText: newTextVi,
              lengthVi: lengthVi,
              isTooLong: isTooLong,
              isTruncated: isTooLong // Luôn lưu flag bị truncate để query (nếu nó là Dialog thì code deploy BTXT sẽ tự bỏ qua Truncate)
            } 
          }
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, lengthVi, lengthEn: doc.lengthEn, isTruncated: isTooLong }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Phục vụ frontend tĩnh
  try {
    let servePath = url.pathname === "/" ? "/index.html" : url.pathname;
    let filePath = path.join(__dirname, "viewer", servePath);
    
    // Bảo mật: không cho thoát khỏi thư mục viewer
    if (!filePath.startsWith(path.join(__dirname, "viewer"))) {
      throw new Error("Access denied");
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "text/plain";
    
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not Found");
    } else {
      res.writeHead(500);
      res.end("Internal Error");
    }
  }
});

const PORT = 3005;
server.listen(PORT, () => {
  console.log(`🚀 String Viewer Server running at http://localhost:${PORT}`);
});
