process.env.DB_FILE = ':memory:';
process.env.JWT_SECRET = 'test-secret-with-sufficient-length';

const { randomBytes } = require('node:crypto');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/database');

let product;

async function registerAndGetToken() {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'buyer@example.com', password: 'correct-horse-battery' })
    .expect(201);
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'buyer@example.com', password: 'correct-horse-battery' })
    .expect(200);
  return response.body.token;
}

beforeEach(() => {
  db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM cart_items; DELETE FROM carts; DELETE FROM products; DELETE FROM users;');
  const id = randomBytes(12).toString('hex');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO products (id, name, description, category, price, stock, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'Canvas Bag', '', 'bags', 12, 10, now, now);
  product = { id };
});

afterAll(() => {
  db.close();
});

test('rejects login with an incorrect password', async () => {
  await request(app)
    .post('/api/auth/register')
    .send({ email: 'buyer@example.com', password: 'correct-horse-battery' })
    .expect(201);

  await request(app)
    .post('/api/auth/login')
    .send({ email: 'buyer@example.com', password: 'incorrect-password' })
    .expect(401);
});

test('denies protected cart access without a valid token', async () => {
  await request(app).get('/api/cart').expect(401);
});

test('returns the requested first page when listing products', async () => {
  const now = new Date().toISOString();
  const insertProduct = db.prepare(`
    INSERT INTO products (id, name, description, category, price, stock, created_at, updated_at)
    VALUES (?, ?, '', ?, ?, ?, ?, ?)
  `);
  insertProduct.run(randomBytes(12).toString('hex'), 'A Bag', 'bags', 8, 5, now, now);
  insertProduct.run(randomBytes(12).toString('hex'), 'B Bag', 'bags', 9, 5, now, now);

  const response = await request(app).get('/api/products?page=1&limit=2&category=bags').expect(200);
  expect(response.body.items.map((item) => item.name)).toEqual(['A Bag', 'B Bag']);
  expect(response.body.total).toBe(3);
});

test('sets a cart item quantity to the requested value', async () => {
  const token = await registerAndGetToken();
  await request(app)
    .post('/api/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: product.id, quantity: 2 })
    .expect(201);

  const response = await request(app)
    .patch(`/api/cart/items/${product.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ quantity: 5 })
    .expect(200);
  expect(response.body.quantity).toBe(5);
});

test('rejects an order when requested quantity exceeds available stock', async () => {
  db.prepare('UPDATE products SET stock = 1 WHERE id = ?').run(product.id);
  const token = await registerAndGetToken();
  await request(app)
    .post('/api/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: product.id, quantity: 3 })
    .expect(201);

  await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .expect(409);
  expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock).toBe(1);
});

test('calculates the order total from each unit price and quantity', async () => {
  const token = await registerAndGetToken();
  await request(app)
    .post('/api/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId: product.id, quantity: 2 })
    .expect(201);

  const response = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .expect(201);
  expect(response.body.order.subtotal).toBe(24);
  expect(response.body.order.total).toBe(24);
});
