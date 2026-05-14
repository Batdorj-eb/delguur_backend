// ── Category ──────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  created_at: Date;
}

// ── Product ───────────────────────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
  stock: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductDto {
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  category?: string;
  stock?: number;
  is_featured?: boolean;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {
  is_active?: boolean;
}

// ── User ──────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'superadmin';
  created_at: Date;
  updated_at: Date;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// ── Cart ──────────────────────────────────────────────────────────────
export interface Cart {
  id: string;
  session_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  created_at: Date;
  updated_at: Date;
  // joined
  product_name?: string;
  product_price?: number;
  product_image?: string;
  product_stock?: number;
  subtotal?: number;
}

export interface CartItemDto {
  product_id: string;
  quantity: number;
}

// ── Order ─────────────────────────────────────────────────────────────
export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

export type PaymentMethod = 'bank_transfer' | 'cash_on_delivery';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  /** Дансны гүйлгээний утганд оруулах 6 тэмдэгтийн код */
  payment_ref_code: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface CreateOrderDto {
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  /** Хүргэлт эсвэл очиж авах */
  delivery_mode?: 'delivery' | 'pickup';
  shipping_address: string;
  payment_method?: PaymentMethod;
  notes?: string;
  items: {
    product_id: string;
    quantity: number;
  }[];
  /** Дансаар төлөх үед заавал — checkout-оос авсан 6 тэмдэгт */
  reference_code?: string;
}

// ── API Response ──────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ── Express augmentation ──────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
