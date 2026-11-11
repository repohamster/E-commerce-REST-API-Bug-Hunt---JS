# Installation and Execution

## Requirements

- Node.js 18 or newer and npm.
- MongoDB running locally, or a MongoDB connection string you can use.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Create a local environment file and set its values:

   ```sh
   cp .env.example .env
   ```

   - `PORT`: HTTP port (defaults to `3000`).
   - `MONGODB_URI`: MongoDB connection string.
   - `JWT_SECRET`: long, random signing secret. Replace the example value before running the API.
   - `JWT_EXPIRES_IN`: token lifetime accepted by `jsonwebtoken` (defaults to `1d`).

3. Start the API:

   ```sh
   npm start
   ```

   For automatic restarts during development, use `npm run dev`.

## Tests

Run the six integration tests with:

```sh
npm test
```

Tests use `mongodb-memory-server`, so no separate MongoDB service is needed for the test suite. Its MongoDB binary may be downloaded the first time tests run. Four tests are expected to fail until the documented business-logic exercises are corrected; the two authentication regression checks should pass.