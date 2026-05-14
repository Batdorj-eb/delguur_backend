import { Router } from 'express';
import { login, getMe } from '../controllers/authController';
import {
  getProducts, getProductById, getCategories,
  createProduct, updateProduct, deleteProduct,
} from '../controllers/productController';
import {
  getCart, addToCart, updateCartItem,
  removeFromCart, clearCart,
} from '../controllers/cartController';
import {
  createOrder,
  getOrderByNumber,
  getAllOrders,
  getAdminOrderById,
  getPendingOrdersCount,
  updateOrderStatus,
} from '../controllers/orderController';
import { allocateCheckoutReferenceCode } from '../controllers/checkoutReferenceController';
import {
  listCategoriesWithCounts,
  listAllCategories,
  createCategory,
  deleteCategory,
} from '../controllers/categoryController';
import { authenticate } from '../middleware/auth';
import { upload, uploadImage } from '../controllers/uploadController';
import { getPublicSite, getAdminSite, patchAdminSite } from '../controllers/siteSettingsController';

const router = Router();

// ── Auth ──────────────────────────────────────────────────────────────
router.post('/auth/login', login);
router.get('/auth/me', authenticate, getMe);

// ── Public site (нүүр hero зураг) ───────────────────────────────────────
router.get('/public/site', getPublicSite);

// ── Categories (Public) ─────────────────────────────────────────────────
router.get('/categories', listCategoriesWithCounts);

// ── Products (Public) ─────────────────────────────────────────────────
router.get('/products', getProducts);
router.get('/products/categories', getCategories);
router.get('/products/:id', getProductById);

// ── Admin Products ────────────────────────────────────────────────────
router.post('/admin/products', authenticate, createProduct);
router.patch('/admin/products/:id', authenticate, updateProduct);
router.delete('/admin/products/:id', authenticate, deleteProduct);
// Admin can see all products (including inactive)
router.get('/admin/products', authenticate, getProducts);

// ── Cart (Public — session-based) ─────────────────────────────────────
router.get('/cart', getCart);
router.post('/cart/items', addToCart);
router.patch('/cart/items/:itemId', updateCartItem);
router.delete('/cart/items/:itemId', removeFromCart);
router.delete('/cart', clearCart);

// ── Checkout (session) ─────────────────────────────────────────────────
router.post('/checkout/reference-code', allocateCheckoutReferenceCode);

// ── Orders ────────────────────────────────────────────────────────────
router.post('/orders', createOrder);
router.get('/orders/:orderNumber', getOrderByNumber);

// Admin orders (pending-count өмнө нь — :id-тэй давхцахгүй)
router.get('/admin/orders/pending-count', authenticate, getPendingOrdersCount);
router.get('/admin/orders', authenticate, getAllOrders);
router.get('/admin/orders/:id', authenticate, getAdminOrderById);
router.patch('/admin/orders/:id/status', authenticate, updateOrderStatus);

// Admin site (hero зураг)
router.get('/admin/site', authenticate, getAdminSite);
router.patch('/admin/site', authenticate, patchAdminSite);

// Admin categories
router.get('/admin/categories', authenticate, listAllCategories);
router.post('/admin/categories', authenticate, createCategory);
router.delete('/admin/categories/:id', authenticate, deleteCategory);

// ── Upload (Admin) ─────────────────────────────────────────────────────
router.post('/upload/image', authenticate, upload.single('image'), uploadImage);

export default router;
