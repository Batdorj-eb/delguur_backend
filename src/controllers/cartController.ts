import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { CartItem, CartItemDto, ApiResponse } from '../types';
import { AppError } from '../middleware/errorHandler';
import { getSessionId } from '../utils/getSessionId';

// Сагс олох эсвэл үүсгэх
const findOrCreateCart = async (sessionId: string): Promise<string> => {
  const existing = await pool.query(
    'SELECT id FROM carts WHERE session_id = $1',
    [sessionId]
  );
  if (existing.rows[0]) return existing.rows[0].id as string;

  const created = await pool.query(
    'INSERT INTO carts (session_id) VALUES ($1) RETURNING id',
    [sessionId]
  );
  return created.rows[0].id as string;
};

// ── GET /cart ─────────────────────────────────────────────────────────
export const getCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = getSessionId(req);
    const cartResult = await pool.query(
      'SELECT id FROM carts WHERE session_id = $1',
      [sessionId]
    );

    if (!cartResult.rows[0]) {
      res.json(<ApiResponse>{ success: true, data: { items: [], total: 0 } });
      return;
    }

    const cartId = cartResult.rows[0].id as string;
    const items = await pool.query<CartItem>(
      `SELECT
         ci.id, ci.cart_id, ci.product_id, ci.quantity,
         p.name  AS product_name,
         p.price AS product_price,
         p.image_url AS product_image,
         p.stock AS product_stock,
         (p.price * ci.quantity) AS subtotal
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = $1
       ORDER BY ci.created_at ASC`,
      [cartId]
    );

    const total = items.rows.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0
    );

    res.json(<ApiResponse>{
      success: true,
      data: { cart_id: cartId, items: items.rows, total },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /cart/items ──────────────────────────────────────────────────
export const addToCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = getSessionId(req);
    const { product_id, quantity = 1 }: CartItemDto = req.body;

    if (!product_id) throw new AppError(400, 'product_id шаардлагатай.');
    if (quantity < 1) throw new AppError(400, 'Тоо хэмжээ 1-ээс их байна.');

    // Бараа байгаа эсэх + нөөц шалгах
    const product = await pool.query(
      'SELECT id, stock, is_active FROM products WHERE id = $1',
      [product_id]
    );
    if (!product.rows[0]) throw new AppError(404, 'Бараа олдсонгүй.');
    if (!product.rows[0].is_active) throw new AppError(400, 'Бараа одоогоор байхгүй байна.');
    const cartId = await findOrCreateCart(sessionId);

    const existing = await pool.query<{ quantity: number }>(
      `SELECT ci.quantity FROM cart_items ci WHERE ci.cart_id = $1 AND ci.product_id = $2`,
      [cartId, product_id]
    );
    const currentInCart = existing.rows[0] ? Number(existing.rows[0].quantity) : 0;
    const newTotalQty = currentInCart + quantity;
    if (product.rows[0].stock < newTotalQty) {
      throw new AppError(
        400,
        `Нөөц хүрэлцэхгүй. Нийт нөөц: ${product.rows[0].stock}, сагсанд: ${currentInCart}`
      );
    }

    // Аль хэдийн сагсанд байвал quantity нэмнэ
    await pool.query(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, product_id)
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
      [cartId, product_id, quantity]
    );

    res.status(201).json(<ApiResponse>{
      success: true,
      message: 'Бараа сагсанд нэмэгдлээ.',
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /cart/items/:itemId ─────────────────────────────────────────
export const updateCartItem = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = getSessionId(req);
    const { quantity }: { quantity: number } = req.body;
    const { itemId } = req.params;

    if (!quantity || quantity < 1) throw new AppError(400, 'Тоо хэмжээ 1-ээс их байна.');

    const row = await pool.query<{ stock: number; is_active: boolean }>(
      `SELECT p.stock, p.is_active
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       JOIN products p ON p.id = ci.product_id
       WHERE ci.id = $1 AND c.session_id = $2`,
      [itemId, sessionId]
    );

    if (!row.rows[0]) throw new AppError(404, 'Сагсны бараа олдсонгүй.');
    if (!row.rows[0].is_active) throw new AppError(400, 'Бараа одоогоор байхгүй байна.');
    if (quantity > Number(row.rows[0].stock)) {
      throw new AppError(400, `Нөөц хүрэлцэхгүй. Нийт: ${row.rows[0].stock}`);
    }

    const result = await pool.query(
      `UPDATE cart_items ci
       SET quantity = $1
       FROM carts c
       WHERE ci.id = $2
         AND ci.cart_id = c.id
         AND c.session_id = $3
       RETURNING ci.id`,
      [quantity, itemId, sessionId]
    );

    if (!result.rows[0]) throw new AppError(404, 'Сагсны бараа олдсонгүй.');

    res.json(<ApiResponse>{ success: true, message: 'Тоо хэмжээ шинэчлэгдлээ.' });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /cart/items/:itemId ────────────────────────────────────────
export const removeFromCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = getSessionId(req);
    const { itemId } = req.params;

    const result = await pool.query(
      `DELETE FROM cart_items ci
       USING carts c
       WHERE ci.id = $1
         AND ci.cart_id = c.id
         AND c.session_id = $2
       RETURNING ci.id`,
      [itemId, sessionId]
    );

    if (!result.rows[0]) throw new AppError(404, 'Сагсны бараа олдсонгүй.');

    res.json(<ApiResponse>{ success: true, message: 'Бараа сагснаас хасагдлаа.' });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /cart ──────────────────────────────────────────────────────
export const clearCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = getSessionId(req);
    await pool.query(
      'DELETE FROM carts WHERE session_id = $1',
      [sessionId]
    );
    res.json(<ApiResponse>{ success: true, message: 'Сагс цэвэрлэгдлээ.' });
  } catch (err) {
    next(err);
  }
};
