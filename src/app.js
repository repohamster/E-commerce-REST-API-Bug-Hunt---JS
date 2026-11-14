const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('node:crypto');
const db = require('./database');
const requireAuth = require('./middleware/auth');

const app = express();
app.use(express.json());

const createId = () => randomBytes(12).toString('hex');
const timestamp = () => new Date().toISOString();

function getCartItems(cartId) {
  return db.prepare(`
    SELECT product_id AS productId, quantity
    FROM cart_items
    WHERE cart_id = ?
  `).all(cartId);
}

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'A valid email and password of at least 8 characters are required' });
    }

    const id = createId();
    const now = timestamp();
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, email.trim().toLowerCase(), passwordHash, now, now);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Email is already registered' });
      }
      throw error;
    }
    return res.status(201).json({ id, email: email.trim().toLowerCase() });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT id, email, password_hash AS passwordHash FROM users WHERE email = ?')
      .get(typeof email === 'string' ? email.trim().toLowerCase() : '');
    const passwordMatches = user && typeof password === 'string'
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!passwordMatches) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d'
    });
    return res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/products', async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 100);
    const filters = [];
    const values = [];
    if (req.query.category) {
      filters.push('category = ?');
      values.push(req.query.category);
    }
    if (req.query.minPrice !== undefined) {
      filters.push('price >= ?');
      values.push(Number(req.query.minPrice));
    }
    if (req.query.maxPrice !== undefined) {
      filters.push('price <= ?');
      values.push(Number(req.query.maxPrice));
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM products ${where}`).get(...values).count;
    const items = db.prepare(`
      SELECT id AS _id, name, description, category, price, stock,
             created_at AS createdAt, updated_at AS updatedAt
      FROM products
      ${where}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `).all(...values, limit, page * limit);
    return res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/cart', requireAuth, async (req, res, next) => {
  try {
    const cart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(req.user.sub);
    const items = cart ? db.prepare(`
      SELECT p.id AS _id, p.name, p.description, p.category, p.price, p.stock,
             p.created_at AS createdAt, p.updated_at AS updatedAt,
             ci.quantity, p.price * ci.quantity AS lineTotal
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
    `).all(cart.id) : [];
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    return res.json({
      items: items.map(({ quantity, lineTotal, ...product }) => ({ product, quantity, lineTotal })),
      subtotal,
      total: subtotal
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/cart/items', requireAuth, async (req, res, next) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.body.productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const now = timestamp();
    let cart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(req.user.sub);
    if (!cart) {
      const id = createId();
      db.prepare(`
        INSERT INTO carts (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)
      `).run(id, req.user.sub, now, now);
      cart = { id };
    }
    db.prepare(`
      INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT(cart_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity
    `).run(cart.id, product.id, quantity);
    db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?').run(now, cart.id);
    return res.status(201).json({ items: getCartItems(cart.id) });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/cart/items/:productId', requireAuth, async (req, res, next) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }
    const cart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(req.user.sub);
    const item = cart && db.prepare(`
      SELECT product_id AS productId, quantity
      FROM cart_items
      WHERE cart_id = ? AND product_id = ?
    `).get(cart.id, req.params.productId);
    if (!item) return res.status(404).json({ error: 'Cart item not found' });

    const updatedQuantity = item.quantity + quantity;
    db.prepare(`
      UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?
    `).run(updatedQuantity, cart.id, item.productId);
    db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?').run(timestamp(), cart.id);
    return res.json({ productId: item.productId, quantity: updatedQuantity });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/orders', requireAuth, async (req, res, next) => {
  try {
    const cart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(req.user.sub);
    const items = cart ? db.prepare(`
      SELECT p.id AS productId, p.name, p.price AS unitPrice, p.stock, ci.quantity
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = ?
    `).all(cart.id) : [];
    if (!items.length) return res.status(400).json({ error: 'Cart is empty' });

    const orderItems = [];
    for (const item of items) {
      if (item.stock < 0) return res.status(409).json({ error: `Insufficient stock for ${item.name}` });
      orderItems.push({
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity
      });
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.unitPrice, 0);
    const orderId = createId();
    const now = timestamp();
    const createOrder = db.transaction(() => {
      db.prepare(`
        INSERT INTO orders (id, user_id, subtotal, total, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'placed', ?, ?)
      `).run(orderId, req.user.sub, subtotal, subtotal, now, now);
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, name, unit_price, quantity)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const item of orderItems) {
        insertItem.run(orderId, item.productId, item.name, item.unitPrice, item.quantity);
        db.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ?')
          .run(item.quantity, now, item.productId);
      }
      db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
      db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?').run(now, cart.id);
    });
    createOrder();
    return res.status(201).json({
      order: {
        _id: orderId,
        userId: req.user.sub,
        items: orderItems,
        subtotal,
        total: subtotal,
        status: 'placed',
        createdAt: now,
        updatedAt: now
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
