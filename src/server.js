const { app, skipDb, testDatabaseConnection } = require('./app');
const { startServer } = require('./server/startup');

const PORT = process.env.PORT || 3001;

startServer(app, {
  port: PORT,
  skipDb,
  testDatabaseConnection
});

