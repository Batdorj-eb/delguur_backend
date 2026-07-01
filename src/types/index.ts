// ── Category ──────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: Date;
}

export interface CategoryWithParent extends Category {
  parent_name: string | null;
}

// ── Color ─────────────────────────────────────────────────────────────
export interface Color {
  id: string;
  name: string;
  hex_code: string;
  created_at: Date;
}

// ── Size (admin catalog: 56, 57, XS, S, …) ────────────────────────────
export interface Size {
  id: string;
  name: string;
  sort_order: number;
  created_at: Date;
}

export interface ProductImageDto {
  id?: string;
  image_url: string;
  is_primary?: boolean;
  sort_order?: number;
}

export interface ProductColorDto {
  id: string;
  name: string;
  hex_code: string;
  stock?: number;
  size_stocks?: ProductColorSizeStockDto[];
}

export interface ProductColorStockDto {
  color_id: string;
  stock: number;
}

export interface ProductColorSizeStockDto {
  color_id: string;
  size: string;
  stock: number;
}

export interface ProductColorImageDto {
  color_id: string;
  image_url: string;
}

// ── Product ───────────────────────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  /** Хямдралын үнэ — null эсвэл price-аас бага үед идэвхтэй */
  sale_price: number | null;
  image_url: string | null;
  category: string | null;
  stock: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: Date;
  updated_at: Date;
  images?: ProductImageDto[];
  colors?: ProductColorDto[];
  color_images?: ProductColorImageDto[];
}

export interface CreateProductDto {
  name: string;
  description?: string;
  price: number;
  sale_price?: number | null;
  image_url?: string;
  images?: ProductImageInput[];
  category?: string;
  stock?: number;
  is_featured?: boolean;
  color_ids?: string[];
  color_images?: ProductColorImageDto[];
  color_stocks?: ProductColorStockDto[];
  color_size_stocks?: ProductColorSizeStockDto[];
}

export interface ProductImageInput {
  image_url: string;
  is_primary?: boolean;
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
  color_id?: string | null;
  quantity: number;
  created_at: Date;
  updated_at: Date;
  // joined
  product_name?: string;
  product_price?: number;
  product_image?: string;
  product_stock?: number;
  color_name?: string;
  color_hex?: string;
  subtotal?: number;
}

export interface CartItemDto {
  product_id: string;
  quantity: number;
  color_id?: string;
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
    color_id?: string;
  }[];
  /** Дансаар төлөх үед гүйлгээний утга (одоогоор утасны дугаар) */
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
