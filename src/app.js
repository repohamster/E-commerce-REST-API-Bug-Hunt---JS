const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Product, Cart, Order } = require('./models');
const requireAuth = require('./middleware/auth');

const app = express();
app.use(express.json());

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'A valid email and password of at least 8 characters are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash });
    return res.status(201).json({ id: user.id, email: user.email });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Email is already registered' });
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: typeof email === 'string' ? email.toLowerCase() : '' });
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
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
      filter.price = {};
      if (req.query.minPrice !== undefined) filter.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice !== undefined) filter.price.$lte = Number(req.query.maxPrice);
    }

    const [items, total] = await Promise.all([
      Product.find(filter).sort({ name: 1 }).skip(page * limit).limit(limit),
      Product.countDocuments(filter)
    ]);
    return res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/cart', requireAuth, async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.sub }).populate('items.productId');
    const items = (cart?.items || []).map((item) => ({
      product: item.productId,
      quantity: item.quantity,
      lineTotal: item.productId.price * item.quantity
    }));
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    return res.json({ items, subtotal, total: subtotal });
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
    const product = await Product.findById(req.body.productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const cart = await Cart.findOneAndUpdate(
      { userId: req.user.sub },
      { $setOnInsert: { userId: req.user.sub } },
      { new: true, upsert: true }
    );
    const existing = cart.items.find((item) => item.productId.toString() === product.id);
    if (existing) existing.quantity += quantity;
    else cart.items.push({ productId: product.id, quantity });
    await cart.save();
    return res.status(201).json({ items: cart.items });
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
    const cart = await Cart.findOne({ userId: req.user.sub });
    const item = cart?.items.find((entry) => entry.productId.toString() === req.params.productId);
    if (!item) return res.status(404).json({ error: 'Cart item not found' });

    item.quantity += quantity;
    await cart.save();
    return res.json({ productId: item.productId, quantity: item.quantity });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/orders', requireAuth, async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.sub }).populate('items.productId');
    if (!cart?.items.length) return res.status(400).json({ error: 'Cart is empty' });

    const orderItems = [];
    for (const item of cart.items) {
      const product = item.productId;
      if (!product) return res.status(400).json({ error: 'A cart product no longer exists' });
      if (product.stock < 0) return res.status(409).json({ error: `Insufficient stock for ${product.name}` });
      orderItems.push({
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        quantity: item.quantity
      });
      await Product.updateOne({ _id: product.id }, { $inc: { stock: -item.quantity } });
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.unitPrice, 0);
    const order = await Order.create({
      userId: req.user.sub,
      items: orderItems,
      subtotal,
      total: subtotal
    });
    cart.items = [];
    await cart.save();
    return res.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;