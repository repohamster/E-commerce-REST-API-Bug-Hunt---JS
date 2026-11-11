# Installation and Execution

## Requirements

- Node.js 18 or newer and npm.
- No database server is required. The API stores data in a local SQLite file.

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
   - `DB_FILE`: SQLite database file path (defaults to `./data/commerce.sqlite`).
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

Tests use an in-memory SQLite database and do not need a database server or network access. Four tests are expected to fail until the documented business-logic exercises are corrected; the two authentication regression checks should pass.

The local database file is created automatically when the API starts. Keep `data/commerce.sqlite` to preserve data between runs; back it up like any other local data file. To use a different location, change `DB_FILE`.