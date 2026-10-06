import { app } from './app.js';
import { ENV } from './config/env.js';
import { logger } from './config/logger.js';
import { startBackgroundJobs } from './jobs/scheduler.js';

const server = app.listen(ENV.PORT, () => {
  logger.info(`=======================================================`);
  logger.info(`🚀 Dara Digital Backend running on port ${ENV.PORT}`);
  logger.info(`⚡ Environment: ${ENV.NODE_ENV}`);
  logger.info(`🌐 Frontend URL: ${ENV.FRONTEND_URL}`);
  logger.info(`💳 ABA Environment: ${ENV.ABA.ENVIRONMENT}`);
  logger.info(`📱 Telegram Bot: @${ENV.TELEGRAM_BOT_USERNAME}`);
  logger.info(`=======================================================`);

  // Start background schedulers
  startBackgroundJobs();
});

// Graceful Shutdown
function handleShutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
