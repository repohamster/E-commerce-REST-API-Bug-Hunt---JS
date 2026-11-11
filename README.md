# Commerce REST API Training Project

A Node.js and Express REST API for user accounts, product browsing, carts, and orders, using a local SQLite database. No MongoDB server, Atlas account, or Compass installation is required. The project includes six Jest and Supertest integration tests. Four tests expose intentional business-logic defects; the password and authorization tests are security regression checks and pass as provided.

## Features

- Register users and authenticate with JWT bearer tokens.
- Browse products by category and price range with pagination.
- Add products to a user's cart, inspect totals, and change item quantities.
- Place orders and update inventory.
- Persist application data in a local SQLite database file.
- Run integration tests against an isolated in-memory SQLite database.

## API

All request and response bodies use JSON. Protected endpoints require `Authorization: Bearer <token>`.

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Create an account with `{ "email", "password" }`; passwords must be at least 8 characters. |
| `POST` | `/api/auth/login` | Public | Exchange `{ "email", "password" }` for a JWT. |
| `GET` | `/api/products` | Public | List products. Supports `page`, `limit`, `category`, `minPrice`, and `maxPrice`. |
| `GET` | `/api/cart` | JWT | Return cart items, subtotal, and total. |
| `POST` | `/api/cart/items` | JWT | Add `{ "productId", "quantity" }` to the cart. |
| `PATCH` | `/api/cart/items/:productId` | JWT | Change an item's `{ "quantity" }`. |
| `POST` | `/api/orders` | JWT | Place an order from the current cart. |

Product list responses contain `items`, `page`, `limit`, `total`, and `pages`. Order responses contain the created `order` and its line items.

## Known Exercise Behavior

The intentionally incorrect pagination, cart quantity update, checkout stock validation, and order total behavior are described in [BUGS.md](BUGS.md). Authentication is intentionally implemented securely; its two tests guard against accepting an incorrect password or allowing unauthenticated cart access.

See [INSTRUCTIONS.md](INSTRUCTIONS.md) for installation and execution. The database file defaults to `data/commerce.sqlite` and can be changed with `DB_FILE`.