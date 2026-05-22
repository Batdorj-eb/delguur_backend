import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { CartItem, CartItemDto, ApiResponse } from '../types';
import { AppError } from '../middleware/errorHandler';
import { getSessionId } from '../utils/getSessionId';
import {
  assertVariantStockAvailable,
  productHasColors,
} from '../services/productStock';

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

const CART_ITEM_SELECT = `
  SELECT
    ci.id, ci.cart_id, ci.product_id, ci.color_id, ci.quantity,
    p.name  AS product_name,
    p.price AS product_price,
    COALESCE(color_img.image_url, p.image_url) AS product_image,
    COALESCE(pc.stock, p.stock) AS product_stock,
    c.name AS color_name,
    c.hex_code AS color_hex,
    (p.price * ci.quantity) AS subtotal
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
  LEFT JOIN colors c ON c.id = ci.color_id
  LEFT JOIN product_colors pc ON pc.product_id = ci.product_id AND pc.color_id = ci.color_id
  LEFT JOIN LATERAL (
    SELECT pi.image_url
    FROM product_color_images pci
    INNER JOIN product_images pi ON pi.id = pci.product_image_id
    WHERE pci.product_id = ci.product_id AND pci.color_id = ci.color_id
    LIMIT 1
  ) color_img ON TRUE
`;

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
      `${CART_ITEM_SELECT} WHERE ci.cart_id = $1 ORDER BY ci.created_at ASC`,
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

export const addToCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionId = getSessionId(req);
    const { product_id, quantity = 1, color_id }: CartItemDto = req.body;

    if (!product_id) throw new AppError(400, 'product_id шаардлагатай.');
    if (quantity < 1) throw new AppError(400, 'Тоо хэмжээ 1-ээс их байна.');

    const product = await pool.query(
      'SELECT id, is_active FROM products WHERE id = $1',
      [product_id]
    );
    if (!product.rows[0]) throw new AppError(404, 'Бараа олдсонгүй.');
    if (!product.rows[0].is_active) throw new AppError(400, 'Бараа одоогоор байхгүй байна.');

    const hasColors = await productHasColors(product_id);
    const colorId = color_id?.trim() || null;
    if (hasColors && !colorId) {
      throw new AppError(400, 'Энэ бараанд өнгө сонгоно уу.');
    }
    if (colorId) {
      const linked = await pool.query(
        'SELECT 1 FROM product_colors WHERE product_id = $1 AND color_id = $2',
        [product_id, colorId]
      );
      if (!linked.rows[0]) {
        throw new AppError(400, 'Сонгосон өнгө энэ бараанд байхгүй.');
      }
    }

    const cartId = await findOrCreateCart(sessionId);

    const existing = await pool.query<{ quantity: number }>(
      `SELECT quantity FROM cart_items
       WHERE cart_id = $1 AND product_id = $2
         AND (color_id IS NOT DISTINCT FROM $3)`,
      [cartId, product_id, colorId]
    );
    const currentInCart = existing.rows[0] ? Number(existing.rows[0].quantity) : 0;
    const newTotalQty = currentInCart + quantity;

    await assertVariantStockAvailable(product_id, colorId, newTotalQty);

    if (existing.rows[0]) {
      await pool.query(
        `UPDATE cart_items SET quantity = $1
         WHERE cart_id = $2 AND product_id = $3
           AND (color_id IS NOT DISTINCT FROM $4)`,
        [newTotalQty, cartId, product_id, colorId]
      );
    } else {
      await pool.query(
        `INSERT INTO cart_items (cart_id, product_id, color_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [cartId, product_id, colorId, quantity]
      );
    }

    res.status(201).json(<ApiResponse>{
      success: true,
      message: 'Бараа сагсанд нэмэгдлээ.',
    });
  } catch (err) {
    next(err);
  }
};

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

    const row = await pool.query<{
      product_id: string;
      color_id: string | null;
      is_active: boolean;
    }>(
      `SELECT ci.product_id, ci.color_id, p.is_active
       FROM cart_items ci
       JOIN carts c ON ci.cart_id = c.id
       JOIN products p ON p.id = ci.product_id
       WHERE ci.id = $1 AND c.session_id = $2`,
      [itemId, sessionId]
    );

    if (!row.rows[0]) throw new AppError(404, 'Сагсны бараа олдсонгүй.');
    if (!row.rows[0].is_active) throw new AppError(400, 'Бараа одоогоор байхгүй байна.');

    await assertVariantStockAvailable(
      row.rows[0].product_id,
      row.rows[0].color_id,
      quantity
    );

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
