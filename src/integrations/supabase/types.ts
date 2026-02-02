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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      appointment_pauses: {
        Row: {
          appointment_id: string
          created_by_id: string | null
          id: string
          paused_at: string
          reason: string
          resumed_at: string | null
        }
        Insert: {
          appointment_id: string
          created_by_id?: string | null
          id?: string
          paused_at?: string
          reason: string
          resumed_at?: string | null
        }
        Update: {
          appointment_id?: string
          created_by_id?: string | null
          id?: string
          paused_at?: string
          reason?: string
          resumed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_pauses_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_services: {
        Row: {
          appointment_id: string
          created_at: string
          duration_minutes: number
          ended_at: string | null
          id: string
          package_id: string | null
          price: number
          service_id: string | null
          service_name: string
          started_at: string | null
          status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          appointment_id: string
          created_at?: string
          duration_minutes: number
          ended_at?: string | null
          id?: string
          package_id?: string | null
          price: number
          service_id?: string | null
          service_name: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          appointment_id?: string
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          id?: string
          package_id?: string | null
          price?: number
          service_id?: string | null
          service_name?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          amount_paid: number
          assigned_staff_id: string | null
          cancellation_reason: string | null
          created_at: string
          created_by_id: string | null
          customer_id: string
          deposit_amount: number
          id: string
          is_unscheduled: boolean
          is_walk_in: boolean
          location_id: string
          notes: string | null
          pause_count: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          purse_amount_used: number
          reschedule_count: number
          scheduled_end: string | null
          scheduled_start: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          amount_paid?: number
          assigned_staff_id?: string | null
          cancellation_reason?: string | null
          created_at?: string
          created_by_id?: string | null
          customer_id: string
          deposit_amount?: number
          id?: string
          is_unscheduled?: boolean
          is_walk_in?: boolean
          location_id: string
          notes?: string | null
          pause_count?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          purse_amount_used?: number
          reschedule_count?: number
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          amount_paid?: number
          assigned_staff_id?: string | null
          cancellation_reason?: string | null
          created_at?: string
          created_by_id?: string | null
          customer_id?: string
          deposit_amount?: number
          id?: string
          is_unscheduled?: boolean
          is_walk_in?: boolean
          location_id?: string
          notes?: string | null
          pause_count?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          purse_amount_used?: number
          reschedule_count?: number
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_credits: {
        Row: {
          balance: number
          created_at: string
          free_monthly_allocation: number
          id: string
          last_reset_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          free_monthly_allocation?: number
          id?: string
          last_reset_at?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          free_monthly_allocation?: number
          id?: string
          last_reset_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_purses: {
        Row: {
          balance: number
          created_at: string
          customer_id: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          customer_id: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          customer_id?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_purses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_purses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_visit_at: string | null
          notes: string | null
          outstanding_balance: number
          phone: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
          visit_count: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          last_visit_at?: string | null
          notes?: string | null
          outstanding_balance?: number
          phone?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string | null
          visit_count?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_visit_at?: string | null
          notes?: string | null
          outstanding_balance?: number
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          availability: Database["public"]["Enums"]["location_availability"]
          city: string
          closing_time: string
          country: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          opening_days: string[]
          opening_time: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          availability?: Database["public"]["Enums"]["location_availability"]
          city: string
          closing_time?: string
          country: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          opening_days?: string[]
          opening_time?: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          availability?: Database["public"]["Enums"]["location_availability"]
          city?: string
          closing_time?: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          opening_days?: string[]
          opening_time?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      package_items: {
        Row: {
          created_at: string
          id: string
          package_id: string
          quantity: number
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          quantity?: number
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          quantity?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          original_price: number | null
          price: number
          status: Database["public"]["Enums"]["service_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          original_price?: number | null
          price: number
          status?: Database["public"]["Enums"]["service_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          original_price?: number | null
          price?: number
          status?: Database["public"]["Enums"]["service_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          status: Database["public"]["Enums"]["service_status"]
          stock_quantity: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price: number
          status?: Database["public"]["Enums"]["service_status"]
          stock_quantity?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          status?: Database["public"]["Enums"]["service_status"]
          stock_quantity?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      refund_requests: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by_id: string | null
          created_at: string
          customer_id: string
          id: string
          reason: string
          refund_type: Database["public"]["Enums"]["refund_type"]
          rejection_reason: string | null
          requested_by_id: string | null
          status: Database["public"]["Enums"]["refund_status"]
          tenant_id: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          reason: string
          refund_type: Database["public"]["Enums"]["refund_type"]
          rejection_reason?: string | null
          requested_by_id?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          tenant_id: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          reason?: string
          refund_type?: Database["public"]["Enums"]["refund_type"]
          rejection_reason?: string | null
          requested_by_id?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          tenant_id?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string | null
          created_at: string
          deposit_amount: number | null
          deposit_percentage: number | null
          deposit_required: boolean
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number
          status: Database["public"]["Enums"]["service_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_percentage?: number | null
          deposit_required?: boolean
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          price: number
          status?: Database["public"]["Enums"]["service_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_percentage?: number | null
          deposit_required?: boolean
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          price?: number
          status?: Database["public"]["Enums"]["service_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_locations: {
        Row: {
          created_at: string
          id: string
          location_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          country: string
          created_at: string
          currency: string
          deposits_enabled: boolean
          id: string
          name: string
          online_booking_enabled: boolean
          pay_at_salon_enabled: boolean
          paystack_customer_code: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          slug: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          country: string
          created_at?: string
          currency?: string
          deposits_enabled?: boolean
          id?: string
          name: string
          online_booking_enabled?: boolean
          pay_at_salon_enabled?: boolean
          paystack_customer_code?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          country?: string
          created_at?: string
          currency?: string
          deposits_enabled?: boolean
          id?: string
          name?: string
          online_booking_enabled?: boolean
          pay_at_salon_enabled?: boolean
          paystack_customer_code?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          appointment_id: string | null
          created_at: string
          created_by_id: string | null
          currency: string
          customer_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          provider: string | null
          provider_reference: string | null
          status: string
          tenant_id: string
          type: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          created_at?: string
          created_by_id?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          provider?: string | null
          provider_reference?: string | null
          status?: string
          tenant_id: string
          type: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          created_by_id?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          provider?: string | null
          provider_reference?: string | null
          status?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      belongs_to_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      get_user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          _action: string
          _after_json?: Json
          _before_json?: Json
          _entity_id: string
          _entity_type: string
          _metadata?: Json
          _tenant_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "supervisor" | "receptionist" | "staff"
      appointment_status:
        | "scheduled"
        | "started"
        | "paused"
        | "completed"
        | "cancelled"
        | "rescheduled"
      location_availability: "open" | "closed" | "temporarily_unavailable"
      payment_method:
        | "card"
        | "mobile_money"
        | "cash"
        | "pos"
        | "transfer"
        | "purse"
      payment_status:
        | "unpaid"
        | "deposit_paid"
        | "fully_paid"
        | "pay_at_salon"
        | "refunded_partial"
        | "refunded_full"
      refund_status: "pending" | "approved" | "rejected" | "completed"
      refund_type: "original_method" | "store_credit" | "offline"
      service_status: "active" | "inactive" | "archived"
      subscription_plan: "solo" | "studio" | "chain"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "paused"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["owner", "manager", "supervisor", "receptionist", "staff"],
      appointment_status: [
        "scheduled",
        "started",
        "paused",
        "completed",
        "cancelled",
        "rescheduled",
      ],
      location_availability: ["open", "closed", "temporarily_unavailable"],
      payment_method: [
        "card",
        "mobile_money",
        "cash",
        "pos",
        "transfer",
        "purse",
      ],
      payment_status: [
        "unpaid",
        "deposit_paid",
        "fully_paid",
        "pay_at_salon",
        "refunded_partial",
        "refunded_full",
      ],
      refund_status: ["pending", "approved", "rejected", "completed"],
      refund_type: ["original_method", "store_credit", "offline"],
      service_status: ["active", "inactive", "archived"],
      subscription_plan: ["solo", "studio", "chain"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "paused",
      ],
    },
  },
} as const
