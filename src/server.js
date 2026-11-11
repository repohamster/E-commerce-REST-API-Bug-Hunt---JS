require('dotenv').config();
const app = require('./app');

async function start() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set');
  }
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Commerce API listening on port ${port}`));
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});