import axios from 'axios';

async function benchmark() {
  console.log('⚡ Running API Latency & Speed Benchmark...');

  const endpoints = [
    'http://localhost:5001/api/categories',
    'http://localhost:5001/api/products?limit=10',
    'http://localhost:5001/api/products?featured=true&limit=6',
    'http://localhost:5001/api/products?sortBy=popular&limit=6'
  ];

  for (const url of endpoints) {
    const start = performance.now();
    const res = await axios.get(url);
    const duration = (performance.now() - start).toFixed(2);
    console.log(`✅ [${res.status}] ${url.replace('http://localhost:5001', '')} -> ${duration}ms (Items: ${res.data.data.items?.length || res.data.data.length})`);
  }
}

benchmark().catch(console.error);
