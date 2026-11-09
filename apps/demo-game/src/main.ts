import { createDemoApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { server } = createDemoApp({ config });

server.listen(config.port, () => {
  console.log(`[demo-game] Nova Games tourne sur http://localhost:${config.port} (Wolleen : ${config.wolleenUrl})`);
  console.log(`[demo-game]   webhook       POST http://localhost:${config.port}/wolleen/webhook`);
  console.log(`[demo-game]   player lookup GET  http://localhost:${config.port}/wolleen/players/{player_id}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
