const clients = new Set();

function addClient(res) {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
}

function broadcastStockUpdate({ productId, stock, variantStocks }) {
  const payload = JSON.stringify({ productId, stock, variantStocks });
  for (const res of clients) {
    try {
      res.write(`event: stockUpdate\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      // If write fails, drop the client
      try { res.end(); } catch {}
      clients.delete(res);
    }
  }
}

module.exports = {
  addClient,
  broadcastStockUpdate,
};