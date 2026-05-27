export interface Profile {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_url: string;
  followers_count: number;
  following_count: number;
  posts_count: number;
  instagram_url: string | null;
  tiktok_url: string | null;
  section_title: string | null;
  section_title_size: 'sm' | 'md' | 'lg' | null;
  show_social: boolean | null;
  card_bg: string | null;
  updated_at: string;
}

export interface Post {
  id: string;
  type: 'image' | 'video';
  media_url: string;
  thumbnail_url: string | null;
  destination_url: string;
  caption: string | null;
  order_index: number;
  is_published: boolean;
  created_at: string;
  // Campos do card de produto
  badge: string | null;
  price_prefix: string | null;
  price: number | null;
  price_suffix: string | null;
  cta_label: string | null;
  title_size: 'sm' | 'md' | 'lg' | null;
}

export interface DraftState {
  profile: Partial<Profile>;
  posts: Post[];
  dirty: boolean;
}
