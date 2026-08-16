export type Product = {
  id: number;
  name: string;
  description: string;
  category: string;
  price_dzd: number;
  image_url: string;
  panel: string;
  stock: number;
  min_qty: number;
  active: boolean;
  sort: number;
  created_at?: string;
};

export type Order = {
  id: number;
  product_id: number;
  product_name: string;
  buyer_type: string;
  merchant_id: number | null;
  buyer_name: string;
  buyer_telegram: string;
  quantity: number;
  unit_price: number;
  total_dzd: number;
  payment_method: string;
  receipt_url: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export type Merchant = {
  id: number;
  first_name: string;
  last_name: string;
  status: string;
  created_at: string;
  cni_url?: string | null;
};

export type ContentMap = Record<string, string>;
