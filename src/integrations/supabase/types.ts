export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          payload: Json | null
          product_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          payload?: Json | null
          product_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          payload?: Json | null
          product_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_rate_hits: {
        Row: {
          created_at: string
          id: number
          visitor_hash: string
        }
        Insert: {
          created_at?: string
          id?: never
          visitor_hash: string
        }
        Update: {
          created_at?: string
          id?: never
          visitor_hash?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          line_total: number
          name: string
          order_id: string
          product_id: string
          quantity: number
          sku: string
          slug: string
          unit_price: number
        }
        Insert: {
          id?: string
          line_total: number
          name: string
          order_id: string
          product_id: string
          quantity: number
          sku: string
          slug: string
          unit_price: number
        }
        Update: {
          id?: string
          line_total?: number
          name?: string
          order_id?: string
          product_id?: string
          quantity?: number
          sku?: string
          slug?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          access_token: string
          address: string
          area_id: string | null
          branch_id: string | null
          branch_name: string | null
          branch_whatsapp: string | null
          city: string
          courier_company: string
          courier_label: string
          courier_service: string
          created_at: string
          customer_name: string
          customer_note: string | null
          discount_total: number
          district: string
          id: string
          last_transaction_status: string | null
          order_number: string
          paid_at: string | null
          payment_mode: string
          payment_token: string | null
          payment_url: string | null
          postal_code: string
          promo_code: string | null
          province: string
          referral_code: string | null
          shipping_cost: number
          shipping_mode: string
          status: string
          stock_applied: boolean
          stock_shortage: boolean
          subtotal: number
          total: number
          updated_at: string
          user_id: string | null
          whatsapp: string
        }
        Insert: {
          access_token: string
          address: string
          area_id?: string | null
          branch_id?: string | null
          branch_name?: string | null
          branch_whatsapp?: string | null
          city: string
          courier_company: string
          courier_label: string
          courier_service: string
          created_at?: string
          customer_name: string
          customer_note?: string | null
          discount_total?: number
          district: string
          id?: string
          last_transaction_status?: string | null
          order_number: string
          paid_at?: string | null
          payment_mode: string
          payment_token?: string | null
          payment_url?: string | null
          postal_code: string
          promo_code?: string | null
          province: string
          referral_code?: string | null
          shipping_cost: number
          shipping_mode: string
          status?: string
          stock_applied?: boolean
          stock_shortage?: boolean
          subtotal: number
          total: number
          updated_at?: string
          user_id?: string | null
          whatsapp: string
        }
        Update: {
          access_token?: string
          address?: string
          area_id?: string | null
          branch_id?: string | null
          branch_name?: string | null
          branch_whatsapp?: string | null
          city?: string
          courier_company?: string
          courier_label?: string
          courier_service?: string
          created_at?: string
          customer_name?: string
          customer_note?: string | null
          discount_total?: number
          district?: string
          id?: string
          last_transaction_status?: string | null
          order_number?: string
          paid_at?: string | null
          payment_mode?: string
          payment_token?: string | null
          payment_url?: string | null
          postal_code?: string
          promo_code?: string | null
          province?: string
          referral_code?: string | null
          shipping_cost?: number
          shipping_mode?: string
          status?: string
          stock_applied?: boolean
          stock_shortage?: boolean
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
        ]
      }
      product_blocked_skus: {
        Row: {
          created_at: string
          reason: string
          sku: string
        }
        Insert: {
          created_at?: string
          reason: string
          sku: string
        }
        Update: {
          created_at?: string
          reason?: string
          sku?: string
        }
        Relationships: []
      }
      product_blocklist: {
        Row: {
          created_at: string
          pattern: string
          reason: string
        }
        Insert: {
          created_at?: string
          pattern: string
          reason: string
        }
        Update: {
          created_at?: string
          pattern?: string
          reason?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          blocked_reason: string | null
          bpom_number: string | null
          brand: string
          category: string
          compare_at_price: number | null
          created_at: string
          description: string | null
          dose: string | null
          flavor: string | null
          hpp: number | null
          id: string
          image_url: string | null
          images: string[]
          is_active: boolean
          is_blocked: boolean
          is_hero: boolean
          is_purchasable: boolean | null
          name: string
          pack_count: string | null
          price: number | null
          publish_issue: string | null
          servings: string | null
          size: string | null
          sku: string
          slug: string | null
          stock: number
          subcategory: string
          updated_at: string
          variant_group: string | null
          weight_grams: number | null
        }
        Insert: {
          blocked_reason?: string | null
          bpom_number?: string | null
          brand: string
          category: string
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          dose?: string | null
          flavor?: string | null
          hpp?: number | null
          id?: string
          image_url?: string | null
          images?: string[]
          is_active?: boolean
          is_blocked?: boolean
          is_hero?: boolean
          is_purchasable?: boolean | null
          name: string
          pack_count?: string | null
          price?: number | null
          publish_issue?: string | null
          servings?: string | null
          size?: string | null
          sku: string
          slug?: string | null
          stock?: number
          subcategory: string
          updated_at?: string
          variant_group?: string | null
          weight_grams?: number | null
        }
        Update: {
          blocked_reason?: string | null
          bpom_number?: string | null
          brand?: string
          category?: string
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          dose?: string | null
          flavor?: string | null
          hpp?: number | null
          id?: string
          image_url?: string | null
          images?: string[]
          is_active?: boolean
          is_blocked?: boolean
          is_hero?: boolean
          is_purchasable?: boolean | null
          name?: string
          pack_count?: string | null
          price?: number | null
          publish_issue?: string | null
          servings?: string | null
          size?: string | null
          sku?: string
          slug?: string | null
          stock?: number
          subcategory?: string
          updated_at?: string
          variant_group?: string | null
          weight_grams?: number | null
        }
        Relationships: []
      }
      products_backup_20261011: {
        Row: {
          blocked_reason: string | null
          bpom_number: string | null
          brand: string | null
          category: string | null
          compare_at_price: number | null
          created_at: string | null
          description: string | null
          dose: string | null
          flavor: string | null
          hpp: number | null
          id: string | null
          image_url: string | null
          images: string[] | null
          is_active: boolean | null
          is_blocked: boolean | null
          is_purchasable: boolean | null
          name: string | null
          pack_count: string | null
          price: number | null
          publish_issue: string | null
          servings: string | null
          size: string | null
          sku: string | null
          slug: string | null
          stock: number | null
          subcategory: string | null
          updated_at: string | null
          variant_group: string | null
          weight_grams: number | null
        }
        Insert: {
          blocked_reason?: string | null
          bpom_number?: string | null
          brand?: string | null
          category?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          description?: string | null
          dose?: string | null
          flavor?: string | null
          hpp?: number | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_blocked?: boolean | null
          is_purchasable?: boolean | null
          name?: string | null
          pack_count?: string | null
          price?: number | null
          publish_issue?: string | null
          servings?: string | null
          size?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          subcategory?: string | null
          updated_at?: string | null
          variant_group?: string | null
          weight_grams?: number | null
        }
        Update: {
          blocked_reason?: string | null
          bpom_number?: string | null
          brand?: string | null
          category?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          description?: string | null
          dose?: string | null
          flavor?: string | null
          hpp?: number | null
          id?: string | null
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_blocked?: boolean | null
          is_purchasable?: boolean | null
          name?: string | null
          pack_count?: string | null
          price?: number | null
          publish_issue?: string | null
          servings?: string | null
          size?: string | null
          sku?: string | null
          slug?: string | null
          stock?: number | null
          subcategory?: string | null
          updated_at?: string | null
          variant_group?: string | null
          weight_grams?: number | null
        }
        Relationships: []
      }
      promos: {
        Row: {
          brand: string | null
          code: string
          created_at: string
          ends_at: string
          id: string
          is_active: boolean
          kind: string
          label: string
          starts_at: string
          updated_at: string
          value: number
        }
        Insert: {
          brand?: string | null
          code: string
          created_at?: string
          ends_at: string
          id?: string
          is_active?: boolean
          kind?: string
          label: string
          starts_at: string
          updated_at?: string
          value: number
        }
        Update: {
          brand?: string | null
          code?: string
          created_at?: string
          ends_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          label?: string
          starts_at?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      store_branches: {
        Row: {
          area: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          maps_url: string | null
          name: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          area?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          maps_url?: string | null
          name: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          area?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          maps_url?: string | null
          name?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          free_shipping_note: string
          hero_subtitle: string
          hero_title: string
          id: number
          logo_url: string | null
          operating_hours: string
          store_name: string
          updated_at: string
        }
        Insert: {
          free_shipping_note?: string
          hero_subtitle?: string
          hero_title?: string
          id?: number
          logo_url?: string | null
          operating_hours?: string
          store_name?: string
          updated_at?: string
        }
        Update: {
          free_shipping_note?: string
          hero_subtitle?: string
          hero_title?: string
          id?: number
          logo_url?: string | null
          operating_hours?: string
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_product_hpp: {
        Args: { _ids: string[] }
        Returns: {
          hpp: number
          id: string
        }[]
      }
      admin_set_product_hpp: {
        Args: { _hpp: number; _id: string }
        Returns: undefined
      }
      apply_order_payment_status: {
        Args: {
          _order_id: string
          _status: string
          _transaction_status: string
        }
        Returns: string
      }
      chat_rate_hit: {
        Args: { _limit?: number; _visitor: string; _window_minutes?: number }
        Returns: boolean
      }
      get_order_by_token: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owner_add_block: {
        Args: { _kind: string; _reason: string; _value: string }
        Returns: string
      }
      owner_remove_block: {
        Args: { _kind: string; _value: string }
        Returns: undefined
      }
      product_block_reason: { Args: { _text: string }; Returns: string }
      publish_missing: {
        Args: {
          _has_photo: boolean
          _price: number
          _stock: number
          _weight: number
        }
        Returns: string
      }
      staff_cancel_order: { Args: { _order_id: string }; Returns: string }
      staff_check_blocked: {
        Args: { _skus: string[]; _texts: string[] }
        Returns: string[]
      }
      staff_confirm_order: { Args: { _order_id: string }; Returns: string }
    }
    Enums: {
      app_role: "owner" | "admin" | "seller"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "seller"],
    },
  },
} as const
