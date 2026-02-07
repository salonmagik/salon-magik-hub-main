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
      appointment_attachments: {
        Row: {
          appointment_id: string
          created_at: string
          created_by_id: string | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          is_drawing: boolean
          tenant_id: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          created_by_id?: string | null
          file_name: string
          file_type: string
          file_url: string
          id?: string
          is_drawing?: boolean
          tenant_id: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          created_by_id?: string | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          is_drawing?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_attachments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      appointment_products: {
        Row: {
          appointment_id: string
          created_at: string
          fulfilled_at: string | null
          fulfillment_status: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          appointment_id: string
          created_at?: string
          fulfilled_at?: string | null
          fulfillment_status?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          appointment_id?: string
          created_at?: string
          fulfilled_at?: string | null
          fulfillment_status?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "appointment_products_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          confirmation_status: string | null
          created_at: string
          created_by_id: string | null
          customer_id: string
          deposit_amount: number
          id: string
          is_gifted: boolean
          is_unscheduled: boolean
          is_walk_in: boolean
          last_reminder_sent_at: string | null
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
          confirmation_status?: string | null
          created_at?: string
          created_by_id?: string | null
          customer_id: string
          deposit_amount?: number
          id?: string
          is_gifted?: boolean
          is_unscheduled?: boolean
          is_walk_in?: boolean
          last_reminder_sent_at?: string | null
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
          confirmation_status?: string | null
          created_at?: string
          created_by_id?: string | null
          customer_id?: string
          deposit_amount?: number
          id?: string
          is_gifted?: boolean
          is_unscheduled?: boolean
          is_walk_in?: boolean
          last_reminder_sent_at?: string | null
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
            referencedRelation: "public_booking_tenants"
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
          criticality_score: number | null
          ended_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          started_at: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          criticality_score?: number | null
          ended_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          started_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          criticality_score?: number | null
          ended_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          started_at?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_allowed_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
        }
        Relationships: []
      }
      backoffice_sessions: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          end_reason: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          isp: string | null
          last_activity_at: string
          region: string | null
          session_token: string
          started_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          isp?: string | null
          last_activity_at?: string
          region?: string | null
          session_token: string
          started_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          isp?: string | null
          last_activity_at?: string
          region?: string | null
          session_token?: string
          started_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backoffice_users: {
        Row: {
          created_at: string
          email_domain: string
          id: string
          last_login_at: string | null
          role: Database["public"]["Enums"]["backoffice_role"]
          totp_enabled: boolean
          totp_secret: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_domain: string
          id?: string
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["backoffice_role"]
          totp_enabled?: boolean
          totp_secret?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_domain?: string
          id?: string
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["backoffice_role"]
          totp_enabled?: boolean
          totp_secret?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "public_booking_tenants"
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
          flag_reason: string | null
          full_name: string
          id: string
          last_visit_at: string | null
          notes: string | null
          outstanding_balance: number
          phone: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
          visit_count: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          flag_reason?: string | null
          full_name: string
          id?: string
          last_visit_at?: string | null
          notes?: string | null
          outstanding_balance?: number
          phone?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
          visit_count?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          flag_reason?: string | null
          full_name?: string
          id?: string
          last_visit_at?: string | null
          notes?: string | null
          outstanding_balance?: number
          phone?: string | null
          status?: string
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
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          channel: string | null
          created_at: string
          id: string
          is_active: boolean
          subject: string
          template_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          body_html: string
          channel?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          subject: string
          template_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          channel?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          subject?: string
          template_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verification_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          created_by_id: string | null
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          reason: string | null
          schedule_end: string | null
          schedule_start: string | null
          scope: Database["public"]["Enums"]["feature_flag_scope"]
          target_tenant_ids: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_id?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          reason?: string | null
          schedule_end?: string | null
          schedule_start?: string | null
          scope?: Database["public"]["Enums"]["feature_flag_scope"]
          target_tenant_ids?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_id?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          reason?: string | null
          schedule_end?: string | null
          schedule_start?: string | null
          scope?: Database["public"]["Enums"]["feature_flag_scope"]
          target_tenant_ids?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      impersonation_sessions: {
        Row: {
          backoffice_user_id: string
          created_at: string
          ended_at: string | null
          id: string
          reason: string
          started_at: string
          tenant_id: string
        }
        Insert: {
          backoffice_user_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          reason: string
          started_at?: string
          tenant_id: string
        }
        Update: {
          backoffice_user_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          reason?: string
          started_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_backoffice_user_id_fkey"
            columns: ["backoffice_user_id"]
            isOneToOne: false
            referencedRelation: "backoffice_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          product_id: string | null
          quantity: number
          service_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          appointment_id: string | null
          created_at: string
          currency: string
          customer_id: string
          discount: number
          due_date: string | null
          id: string
          invoice_number: string
          notes: string | null
          paid_at: string | null
          pdf_url: string | null
          sent_at: string | null
          status: string
          subtotal: number
          tax: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          notes?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          amount: number
          appointment_id: string | null
          approved_at: string | null
          approved_by_id: string | null
          category: Database["public"]["Enums"]["journal_category"]
          created_at: string
          created_by_id: string | null
          currency: string
          customer_id: string | null
          description: string | null
          direction: Database["public"]["Enums"]["journal_direction"]
          id: string
          occurred_at: string
          parsed_summary: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          rejection_reason: string | null
          status: Database["public"]["Enums"]["journal_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          approved_at?: string | null
          approved_by_id?: string | null
          category?: Database["public"]["Enums"]["journal_category"]
          created_at?: string
          created_by_id?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          direction: Database["public"]["Enums"]["journal_direction"]
          id?: string
          occurred_at?: string
          parsed_summary?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          approved_at?: string | null
          approved_by_id?: string | null
          category?: Database["public"]["Enums"]["journal_category"]
          created_at?: string
          created_by_id?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["journal_direction"]
          id?: string
          occurred_at?: string
          parsed_summary?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_line_items: {
        Row: {
          created_at: string
          id: string
          journal_entry_id: string
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          journal_entry_id: string
          product_id?: string | null
          product_name: string
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          journal_entry_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_line_items_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          phone: string | null
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
          phone?: string | null
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
          phone?: string | null
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_events: {
        Row: {
          created_at: string
          created_by_id: string | null
          description: string | null
          end_at: string | null
          id: string
          is_active: boolean
          resolution_notes: string | null
          resolved_at: string | null
          scope: string
          severity: string
          start_at: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_id?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          is_active?: boolean
          resolution_notes?: string | null
          resolved_at?: string | null
          scope?: string
          severity?: string
          start_at: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_id?: string | null
          description?: string | null
          end_at?: string | null
          id?: string
          is_active?: boolean
          resolution_notes?: string | null
          resolved_at?: string | null
          scope?: string
          severity?: string
          start_at?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_logs: {
        Row: {
          channel: string
          created_at: string
          credits_used: number
          customer_id: string | null
          error_message: string | null
          id: string
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
          template_type: string | null
          tenant_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          credits_used?: number
          customer_id?: string | null
          error_message?: string | null
          id?: string
          recipient: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_type?: string | null
          tenant_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          credits_used?: number
          customer_id?: string | null
          error_message?: string | null
          id?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          created_at: string
          email_appointment_reminders: boolean
          email_cancellations: boolean
          email_daily_digest: boolean
          email_new_bookings: boolean
          id: string
          reminder_hours_before: number
          sms_appointment_reminders: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_appointment_reminders?: boolean
          email_cancellations?: boolean
          email_daily_digest?: boolean
          email_new_bookings?: boolean
          id?: string
          reminder_hours_before?: number
          sms_appointment_reminders?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_appointment_reminders?: boolean
          email_cancellations?: boolean
          email_daily_digest?: boolean
          email_new_bookings?: boolean
          id?: string
          reminder_hours_before?: number
          sms_appointment_reminders?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          description: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read: boolean
          tenant_id: string
          title: string
          type: string
          urgent: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read?: boolean
          tenant_id: string
          title: string
          type: string
          urgent?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read?: boolean
          tenant_id?: string
          title?: string
          type?: string
          urgent?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
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
          product_id: string | null
          quantity: number
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          product_id?: string | null
          quantity?: number
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          product_id?: string | null
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
            foreignKeyName: "package_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
          image_urls: string[] | null
          is_flagged: boolean | null
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
          image_urls?: string[] | null
          is_flagged?: boolean | null
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
          image_urls?: string[] | null
          is_flagged?: boolean | null
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
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount: number
          appointment_id: string | null
          created_at: string
          currency: string
          customer_email: string
          customer_name: string | null
          funds_status: string | null
          gateway: string
          gateway_reference: string | null
          id: string
          is_deposit: boolean
          metadata: Json | null
          paystack_access_code: string | null
          paystack_reference: string | null
          refunded_at: string | null
          released_at: string | null
          status: string
          stripe_session_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_email: string
          customer_name?: string | null
          funds_status?: string | null
          gateway: string
          gateway_reference?: string | null
          id?: string
          is_deposit?: boolean
          metadata?: Json | null
          paystack_access_code?: string | null
          paystack_reference?: string | null
          refunded_at?: string | null
          released_at?: string | null
          status?: string
          stripe_session_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string
          customer_name?: string | null
          funds_status?: string | null
          gateway?: string
          gateway_reference?: string | null
          id?: string
          is_deposit?: boolean
          metadata?: Json | null
          paystack_access_code?: string | null
          paystack_reference?: string | null
          refunded_at?: string | null
          released_at?: string | null
          status?: string
          stripe_session_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          created_at: string
          feature_text: string
          id: string
          plan_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          feature_text: string
          id?: string
          plan_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          feature_text?: string
          id?: string
          plan_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          created_at: string
          features_enabled: Json
          id: string
          max_locations: number
          max_products: number | null
          max_services: number | null
          max_staff: number
          monthly_messages: number
          plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          features_enabled?: Json
          id?: string
          max_locations?: number
          max_products?: number | null
          max_services?: number | null
          max_staff?: number
          monthly_messages?: number
          plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          features_enabled?: Json
          id?: string
          max_locations?: number
          max_products?: number | null
          max_services?: number | null
          max_staff?: number
          monthly_messages?: number
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_limits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_pricing: {
        Row: {
          annual_price: number
          created_at: string
          currency: string
          effective_monthly: number
          id: string
          monthly_price: number
          plan_id: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          annual_price?: number
          created_at?: string
          currency: string
          effective_monthly: number
          id?: string
          monthly_price: number
          plan_id: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          annual_price?: number
          created_at?: string
          currency?: string
          effective_monthly?: number
          id?: string
          monthly_price?: number
          plan_id?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_pricing_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_recommended: boolean
          name: string
          slug: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_recommended?: boolean
          name: string
          slug: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_recommended?: boolean
          name?: string
          slug?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by_id: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by_id?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by_id?: string | null
          value?: Json
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_urls: string[] | null
          is_flagged: boolean | null
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
          image_urls?: string[] | null
          is_flagged?: boolean | null
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
          image_urls?: string[] | null
          is_flagged?: boolean | null
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
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "public_booking_tenants"
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
      reschedule_requests: {
        Row: {
          appointment_id: string
          created_at: string | null
          id: string
          proposed_date: string
          proposed_time: string
          requested_by: string
          responded_at: string | null
          status: string | null
        }
        Insert: {
          appointment_id: string
          created_at?: string | null
          id?: string
          proposed_date: string
          proposed_time: string
          requested_by: string
          responded_at?: string | null
          status?: string | null
        }
        Update: {
          appointment_id?: string
          created_at?: string | null
          id?: string
          proposed_date?: string
          proposed_time?: string
          requested_by?: string
          responded_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reschedule_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          id?: string
          module: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
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
          image_urls: string[] | null
          is_flagged: boolean | null
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
          image_urls?: string[] | null
          is_flagged?: boolean | null
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
          image_urls?: string[] | null
          is_flagged?: boolean | null
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
            referencedRelation: "public_booking_tenants"
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
      staff_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          first_name: string
          id: string
          invited_by_id: string | null
          invited_via: string | null
          last_name: string
          last_resent_at: string | null
          resend_count: number | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          tenant_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          first_name: string
          id?: string
          invited_by_id?: string | null
          invited_via?: string | null
          last_name: string
          last_resent_at?: string | null
          resend_count?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          tenant_id: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string
          id?: string
          invited_by_id?: string | null
          invited_via?: string | null
          last_name?: string
          last_resent_at?: string | null
          resend_count?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_tenant_id_fkey"
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
            referencedRelation: "public_booking_tenants"
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
      staff_sessions: {
        Row: {
          created_at: string
          device_type: string | null
          ended_at: string | null
          id: string
          last_activity_at: string
          location_id: string | null
          started_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          location_id?: string | null
          started_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          location_id?: string | null
          started_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_customers: {
        Row: {
          created_at: string
          id: string
          stripe_customer_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          stripe_customer_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          stripe_customer_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          auto_confirm_bookings: boolean | null
          banner_urls: string[] | null
          booking_status_message: string | null
          brand_color: string | null
          cancellation_grace_hours: number | null
          contact_phone: string | null
          country: string
          created_at: string
          currency: string
          default_buffer_minutes: number | null
          default_deposit_percentage: number | null
          deposits_enabled: boolean
          id: string
          logo_url: string | null
          name: string
          online_booking_enabled: boolean
          pay_at_salon_enabled: boolean
          paystack_customer_code: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          show_contact_on_booking: boolean | null
          slot_capacity_default: number
          slug: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          auto_confirm_bookings?: boolean | null
          banner_urls?: string[] | null
          booking_status_message?: string | null
          brand_color?: string | null
          cancellation_grace_hours?: number | null
          contact_phone?: string | null
          country: string
          created_at?: string
          currency?: string
          default_buffer_minutes?: number | null
          default_deposit_percentage?: number | null
          deposits_enabled?: boolean
          id?: string
          logo_url?: string | null
          name: string
          online_booking_enabled?: boolean
          pay_at_salon_enabled?: boolean
          paystack_customer_code?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          show_contact_on_booking?: boolean | null
          slot_capacity_default?: number
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_confirm_bookings?: boolean | null
          banner_urls?: string[] | null
          booking_status_message?: string | null
          brand_color?: string | null
          cancellation_grace_hours?: number | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          currency?: string
          default_buffer_minutes?: number | null
          default_deposit_percentage?: number | null
          deposits_enabled?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          online_booking_enabled?: boolean
          pay_at_salon_enabled?: boolean
          paystack_customer_code?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          show_contact_on_booking?: boolean | null
          slot_capacity_default?: number
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
          paystack_reference: string | null
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
          paystack_reference?: string | null
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
          paystack_reference?: string | null
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
            referencedRelation: "public_booking_tenants"
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
      user_permission_overrides: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          module: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          created_at?: string
          id?: string
          module: string
          tenant_id: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          module?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_tenant_id_fkey"
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
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          amount: number
          balance: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          is_flagged: boolean | null
          purchased_by_customer_id: string | null
          redeemed_by_customer_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          balance: number
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_flagged?: boolean | null
          purchased_by_customer_id?: string | null
          redeemed_by_customer_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          balance?: number
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_flagged?: boolean | null
          purchased_by_customer_id?: string | null
          redeemed_by_customer_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_purchased_by_customer_id_fkey"
            columns: ["purchased_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_redeemed_by_customer_id_fkey"
            columns: ["redeemed_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_leads: {
        Row: {
          approved_at: string | null
          approved_by_id: string | null
          converted_at: string | null
          converted_tenant_id: string | null
          country: string
          created_at: string
          email: string
          id: string
          invitation_expires_at: string | null
          invitation_token: string | null
          name: string
          notes: string | null
          phone: string | null
          plan_interest: string | null
          position: number | null
          rejected_reason: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
          team_size: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_id?: string | null
          converted_at?: string | null
          converted_tenant_id?: string | null
          country: string
          created_at?: string
          email: string
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          plan_interest?: string | null
          position?: number | null
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          team_size?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_id?: string | null
          converted_at?: string | null
          converted_tenant_id?: string | null
          country?: string
          created_at?: string
          email?: string
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          plan_interest?: string | null
          position?: number | null
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          team_size?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_leads_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_leads_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_booking_tenants: {
        Row: {
          auto_confirm_bookings: boolean | null
          banner_urls: string[] | null
          booking_status_message: string | null
          brand_color: string | null
          cancellation_grace_hours: number | null
          contact_phone: string | null
          country: string | null
          currency: string | null
          default_deposit_percentage: number | null
          deposits_enabled: boolean | null
          id: string | null
          logo_url: string | null
          name: string | null
          online_booking_enabled: boolean | null
          pay_at_salon_enabled: boolean | null
          show_contact_on_booking: boolean | null
          slot_capacity_default: number | null
          slug: string | null
          timezone: string | null
        }
        Insert: {
          auto_confirm_bookings?: boolean | null
          banner_urls?: string[] | null
          booking_status_message?: string | null
          brand_color?: string | null
          cancellation_grace_hours?: number | null
          contact_phone?: never
          country?: string | null
          currency?: string | null
          default_deposit_percentage?: number | null
          deposits_enabled?: boolean | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          online_booking_enabled?: boolean | null
          pay_at_salon_enabled?: boolean | null
          show_contact_on_booking?: boolean | null
          slot_capacity_default?: number | null
          slug?: string | null
          timezone?: string | null
        }
        Update: {
          auto_confirm_bookings?: boolean | null
          banner_urls?: string[] | null
          booking_status_message?: string | null
          brand_color?: string | null
          cancellation_grace_hours?: number | null
          contact_phone?: never
          country?: string | null
          currency?: string | null
          default_deposit_percentage?: number | null
          deposits_enabled?: boolean | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          online_booking_enabled?: boolean | null
          pay_at_salon_enabled?: boolean | null
          show_contact_on_booking?: boolean | null
          slot_capacity_default?: number | null
          slug?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      belongs_to_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      generate_invoice_number: { Args: { _tenant_id: string }; Returns: string }
      get_user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
      has_backoffice_role: {
        Args: {
          _role: Database["public"]["Enums"]["backoffice_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_backoffice_user: { Args: { _user_id: string }; Returns: boolean }
      is_bookable_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_owner: {
        Args: { _tenant_id: string; _user_id: string }
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
      backoffice_role: "super_admin" | "admin" | "support_agent"
      feature_flag_scope: "platform" | "app" | "tenant" | "feature"
      journal_category: "service_payment" | "product_sale" | "expense" | "other"
      journal_direction: "inflow" | "outflow"
      journal_status: "active" | "pending_approval" | "rejected" | "reversed"
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
        | "permanently_deactivated"
      waitlist_status: "pending" | "invited" | "converted" | "rejected"
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
      backoffice_role: ["super_admin", "admin", "support_agent"],
      feature_flag_scope: ["platform", "app", "tenant", "feature"],
      journal_category: ["service_payment", "product_sale", "expense", "other"],
      journal_direction: ["inflow", "outflow"],
      journal_status: ["active", "pending_approval", "rejected", "reversed"],
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
        "permanently_deactivated",
      ],
      waitlist_status: ["pending", "invited", "converted", "rejected"],
    },
  },
} as const
