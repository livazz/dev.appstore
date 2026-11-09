export type ItemType = 'consumable' | 'non_consumable' | 'auto_renewable' | 'non_renewing';
export type BgType = 'solid' | 'linear' | 'radial';
export type LayoutId = 1 | 2 | 3 | 4 | 5 | 6;
export type Period = 'week' | 'month' | 'year';
export type Currency = 'EUR' | 'USD';

export interface ItemStyle {
  bgType: BgType;
  bg1: string;
  bg2: string;
  titleColor: string;
  titleBg: string;
  titleOutline: boolean;
  titleShadow: boolean;
  subtitleColor: string;
  priceColor: string;
  priceBg: string;
  priceOutline: boolean;
  priceShadow: boolean;
  borderWidth: number;
  borderColor: string;
  rounded: boolean;
  shadow: boolean;
}

export interface ItemModel {
  image?: string;
  label: string;
}

export interface StoreItem {
  id: string;
  productId: string;
  type: ItemType;
  period: Period;
  title: string;
  subtitle: string;
  keywords: string[];
  price: number;
  oldPrice: number | null;
  models: ItemModel[];
  layout: LayoutId;
  style: ItemStyle;
  createdAt: number;
}

export interface BannerGradient {
  enabled: boolean;
  c1: string;
  c2: string;
  style: 'linear' | 'radial';
}

export interface GridSettings {
  width: number;
  height: number;
  margin: number;
}

export interface App {
  id: string;
  name: string;
  subtitle: string;
  publisher: string;
  icon?: string;
  bannerImage?: string;
  gradient: BannerGradient;
  grid: GridSettings;
  items: StoreItem[];
  currency: Currency;
  apiKey: string;
  webhookSecret: string;
  webhookUrl: string;
  createdAt: number;
}

export interface Order {
  id: string;
  appId: string;
  itemId: string;
  itemTitle: string;
  productId: string;
  amount: number;
  currency: Currency;
  playerId: string;
  email: string;
  status: 'paid' | 'delivered';
  createdAt: number;
}

export interface DB {
  version: number;
  apps: App[];
  orders: Order[];
}
