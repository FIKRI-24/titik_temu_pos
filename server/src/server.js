// src/server.js
import { config } from './config/env.js';
import { testConnection } from './config/db.js';
import app from './app.js';

async function start() {
  try {
    await testConnection();
    process.stdout.write('✅ Database terhubung.\n');
  } catch (err) {
    process.stderr.write(`❌ Gagal terhubung ke database: ${err.message}\n`);
    process.exit(1);
  }

  app.listen(config.port, () => {
    process.stdout.write(`🚀 Server berjalan di http://localhost:${config.port}\n`);
    process.stdout.write(`   Environment: ${config.nodeEnv}\n`);
  });
}

start();
