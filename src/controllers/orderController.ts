import { Request, Response, NextFunction } from 'express';
import pool from '../config/database';
import { CreateOrderDto, Order, ApiResponse, OrderStatus, PaymentStatus } from '../types';
import { AppError } from '../middleware/errorHandler';
import { getSessionId } from '../utils/getSessionId';
import {
  assertVariantStockAvailable,
  deductVariantStock,
  productHasColors,
} from '../services/productStock';

/** I, O, 0, 1-гүй — checkoutReferenceController-тай ижил */
const PAYMENT_REF_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

// Захиалгын дугаар үүсгэх: ORD-20240101-XXXX
const generateOrderNumber = (): string => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${date}-${random}`;
};

const ALLOWED_ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'delivered',
  'cancelled',
];

// Дансаар төлөх — Хаан банк (хэрэглэгчид харуулах)
export const BANK_TRANSFER_DISPLAY = {
  bank: 'Хаан банк',
  account: '5033553814',
  account_holder: 'Т.Цэлмэг',
} as const;

const PICKUP_LOCATION_LABEL = 'Sunday plaza B1 давхар 110 тоот';

/** Хүргэлтийн төлбөр (төгрөг) */
const DELIVERY_SHIPPING_FEE_MNT = 10_000;

// ── POST /orders ──────────────────────────────────────────────────────
export const createOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const client = await pool.connect();
  try {
    const dto: CreateOrderDto = req.body;

    const isPickup = dto.delivery_mode === 'pickup';

    // Validation
    if (!dto.customer_name) {
      throw new AppError(400, 'Нэр шаардлагатай.');
    }
    if (!isPickup && !dto.shipping_address?.trim()) {
      throw new AppError(400, 'Хүргэлтийн хаяг оруулна уу.');
    }
    if (!dto.items || dto.items.length === 0) {
      throw new AppError(400, 'Дор хаяж 1 бараа байна.');
    }

    const payMethod = dto.payment_method || 'bank_transfer';
    const isBank = payMethod === 'bank_transfer';
    const sessionId = isBank ? getSessionId(req) : '';

    const refNormalized = (dto.reference_code || '').trim().toUpperCase();
    if (isBank) {
      if (!PAYMENT_REF_CODE_RE.test(refNormalized)) {
        throw new AppError(
          400,
          'Төлбөрийн 6 тэмдэгтийн код шаардлагатай. Сагсны хуудсаас автоматаар үүссэн кодыг ашиглана уу.'
        );
      }
      if (!dto.customer_phone?.trim()) {
        throw new AppError(400, 'Дансаар төлөх үед утасны дугаар шаардлагатай.');
      }
    }

    await client.query('BEGIN');

    let subtotal = 0;
    const resolvedItems: {
      product_id: string;
      color_id: string | null;
      color_name: string | null;
      name: string;
      price: number;
      quantity: number;
      subtotal: number;
    }[] = [];

    for (const item of dto.items) {
      const product = await client.query(
        'SELECT id, name, price, is_active FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );

      if (!product.rows[0]) throw new AppError(404, `Бараа олдсонгүй: ${item.product_id}`);
      if (!product.rows[0].is_active) {
        throw new AppError(400, `"${product.rows[0].name}" одоогоор байхгүй.`);
      }

      const colorId = item.color_id?.trim() || null;
      const hasColors = await productHasColors(item.product_id, client);
      if (hasColors && !colorId) {
        throw new AppError(400, `"${product.rows[0].name}" — өнгө сонгоно уу.`);
      }

      await assertVariantStockAvailable(item.product_id, colorId, item.quantity, client);

      let colorName: string | null = null;
      if (colorId) {
        const colorRow = await client.query<{ name: string }>(
          'SELECT name FROM colors WHERE id = $1',
          [colorId]
        );
        colorName = colorRow.rows[0]?.name ?? null;
      }

      const displayName = colorName
        ? `${product.rows[0].name} (${colorName})`
        : (product.rows[0].name as string);

      const itemSubtotal = Number(product.rows[0].price) * item.quantity;
      subtotal += itemSubtotal;

      resolvedItems.push({
        product_id: item.product_id,
        color_id: colorId,
        color_name: colorName,
        name: displayName,
        price: Number(product.rows[0].price),
        quantity: item.quantity,
        subtotal: itemSubtotal,
      });

      await deductVariantStock(item.product_id, colorId, item.quantity, client);
    }

    const shippingFee = isPickup ? 0 : DELIVERY_SHIPPING_FEE_MNT;
    const total = subtotal + shippingFee;
    const orderNumber = generateOrderNumber();

    const resolvedShippingAddress = isPickup
      ? `${PICKUP_LOCATION_LABEL} (очиж авах)`
      : dto.shipping_address!.trim();

    let paymentRefForOrder: string | null = null;
    if (isBank) {
      const claimed = await client.query<{ code: string }>(
        `DELETE FROM checkout_reference_codes WHERE session_id = $1 AND code = $2 RETURNING code`,
        [sessionId, refNormalized]
      );
      if (!claimed.rows[0]) {
        throw new AppError(
          400,
          'Төлбөрийн код буруу эсвэл хугацаа дууссан. Хуудсыг шинэчлээд дахин код авна уу.'
        );
      }
      paymentRefForOrder = refNormalized;
    }

    // Захиалга үүсгэх
    const orderResult = await client.query<Order>(
      `INSERT INTO orders
         (order_number, customer_name, customer_email, customer_phone,
          shipping_address, subtotal, shipping_fee, total,
          payment_method, notes, payment_ref_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        orderNumber,
        dto.customer_name.trim(),
        typeof dto.customer_email === 'string'
          ? dto.customer_email.trim().toLowerCase()
          : '',
        dto.customer_phone?.trim() || null,
        resolvedShippingAddress,
        subtotal,
        shippingFee,
        total,
        payMethod,
        dto.notes?.trim() || null,
        paymentRefForOrder,
      ]
    );

    const order = orderResult.rows[0];
    const phoneForTransfer = dto.customer_phone?.trim() || '';

    // Order items нэмэх
    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, color_id, color_name, name, price, quantity, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          order.id,
          item.product_id,
          item.color_id,
          item.color_name,
          item.name,
          item.price,
          item.quantity,
          item.subtotal,
        ]
      );
    }

    await client.query('COMMIT');

    res.status(201).json(<ApiResponse>{
      success: true,
      message: 'Захиалга амжилттай бүртгэгдлээ.',
      data: {
        ...order,
        items: resolvedItems,
        bank_info: isBank
          ? {
              bank: BANK_TRANSFER_DISPLAY.bank,
              account: BANK_TRANSFER_DISPLAY.account,
              account_name: BANK_TRANSFER_DISPLAY.account_holder,
              reference: `${phoneForTransfer} ${paymentRefForOrder}`.trim(),
              payment_ref_code: paymentRefForOrder,
              order_number: orderNumber,
            }
          : null,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ── GET /orders/:orderNumber ──────────────────────────────────────────
export const getOrderByNumber = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<Order>(
      'SELECT * FROM orders WHERE order_number = $1',
      [req.params.orderNumber]
    );

    if (!result.rows[0]) throw new AppError(404, 'Захиалга олдсонгүй.');

    const items = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [result.rows[0].id]
    );

    res.json(<ApiResponse>{
      success: true,
      data: { ...result.rows[0], items: items.rows },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/orders/pending-count (admin) ────────────────────────────
export const getPendingOrdersCount = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM orders WHERE status = 'pending'`
    );
    const count = parseInt(result.rows[0]?.count || '0', 10);
    res.json(<ApiResponse<{ count: number }>>{
      success: true,
      data: { count: Number.isFinite(count) ? count : 0 },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/orders/:id (admin) ──────────────────────────────────────
export const getAdminOrderById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const orderResult = await pool.query<Order>('SELECT * FROM orders WHERE id = $1', [id]);
    if (!orderResult.rows[0]) {
      throw new AppError(404, 'Захиалга олдсонгүй.');
    }
    const items = await pool.query(
      `SELECT oi.id, oi.order_id, oi.product_id, oi.name, oi.price, oi.quantity, oi.subtotal,
              p.image_url AS image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1
       ORDER BY oi.id ASC`,
      [id]
    );
    res.json(<ApiResponse<Order & { items: unknown[] }>>{
      success: true,
      data: { ...orderResult.rows[0], items: items.rows },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /admin/orders (admin) ─────────────────────────────────────────
export const getAllOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM orders ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query<Order>(
      `SELECT * FROM orders ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json(<ApiResponse<Order[]>>{
      success: true,
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /admin/orders/:id/status ────────────────────────────────────
export const updateOrderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status, payment_status }: { status?: OrderStatus; payment_status?: PaymentStatus } = req.body;

    if (!status && !payment_status) {
      throw new AppError(400, 'status эсвэл payment_status шаардлагатай.');
    }

    if (status && !ALLOWED_ORDER_STATUSES.includes(status)) {
      throw new AppError(400, 'Зөвшөөрөгдсөн төлөв: хүлээгдэж буй, баталгаажсан, хүргэгдсэн, цуцлагдсан.');
    }

    const existing = await pool.query<Order>(
      'SELECT * FROM orders WHERE id = $1',
      [req.params.id]
    );
    if (!existing.rows[0]) throw new AppError(404, 'Захиалга олдсонгүй.');

    const o = existing.rows[0];
    const nextStatus = status ?? o.status;
    let nextPayment = payment_status ?? o.payment_status;
    if (status === 'confirmed') {
      nextPayment = 'paid';
    }

    const result = await pool.query<Order>(
      `UPDATE orders
       SET status = $1, payment_status = $2
       WHERE id = $3
       RETURNING *`,
      [nextStatus, nextPayment, req.params.id]
    );

    res.json(<ApiResponse<Order>>{
      success: true,
      message: 'Захиалгын төлөв шинэчлэгдлээ.',
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};
