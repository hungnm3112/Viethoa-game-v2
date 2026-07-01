const { MongoClient } = require('mongodb');
async function run() {
  const c = new MongoClient('mongodb://localhost:27017');
  await c.connect();
  const db = c.db('StateOfDecay_VN');
  const doc = await db.collection('translations').findOne({ occurrences: { $not: { $size: 0 } } });
  console.log(JSON.stringify(doc, null, 2));
  c.close();
}
run();
