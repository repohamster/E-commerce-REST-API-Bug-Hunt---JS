process.env.JWT_SECRET = 'test-secret-with-sufficient-length';

const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/app');
const { User, Product, Cart, Order } = require('../src/models');

let mongoServer;
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

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Product.deleteMany({}), Cart.deleteMany({}), Order.deleteMany({})]);
  product = await Product.create({ name: 'Canvas Bag', category: 'bags', price: 12, stock: 10 });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
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
  await Product.create([
    { name: 'A Bag', category: 'bags', price: 8, stock: 5 },
    { name: 'B Bag', category: 'bags', price: 9, stock: 5 }
  ]);

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
  product.stock = 1;
  await product.save();
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
  expect((await Product.findById(product.id)).stock).toBe(1);
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