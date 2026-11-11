require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

async function start() {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error('MONGODB_URI and JWT_SECRET must be set');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Commerce API listening on port ${port}`));
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});