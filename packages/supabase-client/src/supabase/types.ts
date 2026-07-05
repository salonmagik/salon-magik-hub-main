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
      additional_location_pricing: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_custom: boolean
          plan_id: string
          price_per_location: number | null
          tier_label: string
          tier_max: number | null
          tier_min: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          is_custom?: boolean
          plan_id: string
          price_per_location?: number | null
          tier_label: string
          tier_max?: number | null
          tier_min: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_custom?: boolean
          plan_id?: string
          price_per_location?: number | null
          tier_label?: string
          tier_max?: number | null
          tier_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "additional_location_pricing_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_location_pricing_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_plans_without_active_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      annual_lockin_events: {
        Row: {
          amount: number | null
          annual_offer_id: string | null
          currency: string | null
          id: string
          occurred_at: string
          payment_provider: string
          provider_reference: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount?: number | null
          annual_offer_id?: string | null
          currency?: string | null
          id?: string
          occurred_at?: string
          payment_provider?: string
          provider_reference?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number | null
          annual_offer_id?: string | null
          currency?: string | null
          id?: string
          occurred_at?: string
          payment_provider?: string
          provider_reference?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "annual_lockin_events_annual_offer_id_fkey"
            columns: ["annual_offer_id"]
            isOneToOne: false
            referencedRelation: "annual_lockin_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_lockin_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_lockin_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      annual_lockin_offers: {
        Row: {
          bonus_trial_days: number
          created_at: string
          eligible_until: string
          id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bonus_trial_days?: number
          created_at?: string
          eligible_until: string
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bonus_trial_days?: number
          created_at?: string
          eligible_until?: string
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "annual_lockin_offers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_lockin_offers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          approval_decided_at: string | null
          approval_decided_by: string | null
          approval_invoice_id: string | null
          approval_reason: string | null
          approval_requested_at: string | null
          approval_status: string
          assigned_staff_id: string | null
          booking_metadata: Json
          booking_reference: string | null
          cancellation_reason: string | null
          confirmation_status: string | null
          created_at: string
          created_by_id: string | null
          customer_id: string
          customer_response_status: string
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
          proposed_end: string | null
          proposed_message: string | null
          proposed_start: string | null
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
          approval_decided_at?: string | null
          approval_decided_by?: string | null
          approval_invoice_id?: string | null
          approval_reason?: string | null
          approval_requested_at?: string | null
          approval_status?: string
          assigned_staff_id?: string | null
          booking_metadata?: Json
          booking_reference?: string | null
          cancellation_reason?: string | null
          confirmation_status?: string | null
          created_at?: string
          created_by_id?: string | null
          customer_id: string
          customer_response_status?: string
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
          proposed_end?: string | null
          proposed_message?: string | null
          proposed_start?: string | null
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
          approval_decided_at?: string | null
          approval_decided_by?: string | null
          approval_invoice_id?: string | null
          approval_reason?: string | null
          approval_requested_at?: string | null
          approval_status?: string
          assigned_staff_id?: string | null
          booking_metadata?: Json
          booking_reference?: string | null
          cancellation_reason?: string | null
          confirmation_status?: string | null
          created_at?: string
          created_by_id?: string | null
          customer_id?: string
          customer_response_status?: string
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
          proposed_end?: string | null
          proposed_message?: string | null
          proposed_start?: string | null
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
            foreignKeyName: "appointments_approval_invoice_id_fkey"
            columns: ["approval_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
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
          branch_location_id: string | null
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
          branch_location_id?: string | null
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
          branch_location_id?: string | null
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
            foreignKeyName: "audit_logs_branch_location_id_fkey"
            columns: ["branch_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
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
      auth_otp_attempts: {
        Row: {
          app_scope: string
          channel: string
          created_at: string
          id: string
          identifier: string
          identifier_type: string
        }
        Insert: {
          app_scope: string
          channel: string
          created_at?: string
          id?: string
          identifier: string
          identifier_type: string
        }
        Update: {
          app_scope?: string
          channel?: string
          created_at?: string
          id?: string
          identifier?: string
          identifier_type?: string
        }
        Relationships: []
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
      backoffice_page_keys: {
        Row: {
          created_at: string
          key: string
          label: string
          route_path: string
        }
        Insert: {
          created_at?: string
          key: string
          label: string
          route_path: string
        }
        Update: {
          created_at?: string
          key?: string
          label?: string
          route_path?: string
        }
        Relationships: []
      }
      backoffice_permission_keys: {
        Row: {
          created_at: string
          description: string | null
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string
        }
        Relationships: []
      }
      backoffice_role_template_pages: {
        Row: {
          created_at: string
          id: string
          page_key: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_key: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          page_key?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backoffice_role_template_pages_page_key_fkey"
            columns: ["page_key"]
            isOneToOne: false
            referencedRelation: "backoffice_page_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "backoffice_role_template_pages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "backoffice_role_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_role_template_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backoffice_role_template_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "backoffice_permission_keys"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "backoffice_role_template_permissions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "backoffice_role_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_role_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
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
      backoffice_step_up_challenges: {
        Row: {
          action: string
          created_at: string
          expires_at: string
          id: string
          resource_id: string
          used_at: string | null
          user_id: string
          verified_at: string
        }
        Insert: {
          action: string
          created_at?: string
          expires_at: string
          id?: string
          resource_id: string
          used_at?: string | null
          user_id: string
          verified_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          expires_at?: string
          id?: string
          resource_id?: string
          used_at?: string | null
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      backoffice_user_role_assignments: {
        Row: {
          assigned_by: string | null
          backoffice_user_id: string
          created_at: string
          id: string
          role_template_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          backoffice_user_id: string
          created_at?: string
          id?: string
          role_template_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          backoffice_user_id?: string
          created_at?: string
          id?: string
          role_template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backoffice_user_role_assignments_backoffice_user_id_fkey"
            columns: ["backoffice_user_id"]
            isOneToOne: true
            referencedRelation: "backoffice_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backoffice_user_role_assignments_role_template_id_fkey"
            columns: ["role_template_id"]
            isOneToOne: false
            referencedRelation: "backoffice_role_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      backoffice_users: {
        Row: {
          created_at: string
          email: string | null
          email_domain: string
          first_name: string | null
          id: string
          is_active: boolean | null
          is_sales_agent: boolean
          last_login_at: string | null
          last_name: string | null
          password_changed_at: string | null
          phone: string | null
          role: Database["public"]["Enums"]["backoffice_role"]
          temp_password_required: boolean | null
          totp_enabled: boolean
          totp_required: boolean | null
          totp_secret: string | null
          totp_verified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_domain: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          is_sales_agent?: boolean
          last_login_at?: string | null
          last_name?: string | null
          password_changed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["backoffice_role"]
          temp_password_required?: boolean | null
          totp_enabled?: boolean
          totp_required?: boolean | null
          totp_secret?: string | null
          totp_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          email_domain?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          is_sales_agent?: boolean
          last_login_at?: string | null
          last_name?: string | null
          password_changed_at?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["backoffice_role"]
          temp_password_required?: boolean | null
          totp_enabled?: boolean
          totp_required?: boolean | null
          totp_secret?: string | null
          totp_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      branch_unavailability_windows: {
        Row: {
          created_at: string
          created_by: string | null
          ended_at: string | null
          ended_by: string | null
          ends_at: string | null
          id: string
          is_indefinite: boolean
          location_id: string
          reason: string | null
          starts_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ends_at?: string | null
          id?: string
          is_indefinite?: boolean
          location_id: string
          reason?: string | null
          starts_at: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          ended_by?: string | null
          ends_at?: string | null
          id?: string
          is_indefinite?: boolean
          location_id?: string
          reason?: string | null
          starts_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_unavailability_windows_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_unavailability_windows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_unavailability_windows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_drafts: {
        Row: {
          audience_preset: string
          body: string
          channel: string
          created_at: string
          current_step: number
          expires_at: string
          id: string
          reminder_sent_at: string | null
          saved_at: string
          selected_customer_ids: string[]
          subject: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_preset: string
          body?: string
          channel: string
          created_at?: string
          current_step?: number
          expires_at?: string
          id?: string
          reminder_sent_at?: string | null
          saved_at?: string
          selected_customer_ids?: string[]
          subject?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_preset?: string
          body?: string
          channel?: string
          created_at?: string
          current_step?: number
          expires_at?: string
          id?: string
          reminder_sent_at?: string | null
          saved_at?: string
          selected_customer_ids?: string[]
          subject?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_drafts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_reusable_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string
          id: string
          name: string
          subject: string | null
          tenant_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          subject?: string | null
          tenant_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          subject?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_reusable_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_reusable_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_deletion_requests: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          item_name: string
          item_type: string
          reason: string
          rejection_reason: string | null
          requested_at: string | null
          requested_by_id: string
          reviewed_at: string | null
          reviewed_by_id: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          item_name: string
          item_type: string
          reason: string
          rejection_reason?: string | null
          requested_at?: string | null
          requested_by_id: string
          reviewed_at?: string | null
          reviewed_by_id?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          item_name?: string
          item_type?: string
          reason?: string
          rejection_reason?: string | null
          requested_at?: string | null
          requested_by_id?: string
          reviewed_at?: string | null
          reviewed_by_id?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_deletion_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_deletion_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          finished_at: string | null
          id: string
          import_type: string
          status: string
          summary_json: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          import_type: string
          status?: string
          summary_json?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finished_at?: string | null
          id?: string
          import_type?: string
          status?: string
          summary_json?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_rows: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          normalized_json: Json | null
          raw_json: Json
          row_number: number
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_id: string
          normalized_json?: Json | null
          raw_json: Json
          row_number: number
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          job_id?: string
          normalized_json?: Json | null
          raw_json?: Json
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "catalog_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_item_integrity_issues: {
        Row: {
          branch_location_ids: string[]
          detected_at: string
          id: string
          issue_code: string
          issue_message: string
          item_id: string
          item_type: string
          metadata: Json
          resolved_at: string | null
          severity: string
          tenant_id: string
        }
        Insert: {
          branch_location_ids?: string[]
          detected_at?: string
          id?: string
          issue_code: string
          issue_message: string
          item_id: string
          item_type: string
          metadata?: Json
          resolved_at?: string | null
          severity: string
          tenant_id: string
        }
        Update: {
          branch_location_ids?: string[]
          detected_at?: string
          id?: string
          issue_code?: string
          issue_message?: string
          item_id?: string
          item_type?: string
          metadata?: Json
          resolved_at?: string | null
          severity?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_item_integrity_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_item_integrity_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chain_addon_pricing: {
        Row: {
          country_code: string
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          id: string
          notes: string | null
          status: string
          unit_price_per_extra_location: number
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          created_by?: string | null
          currency: string
          effective_from?: string
          id?: string
          notes?: string | null
          status?: string
          unit_price_per_extra_location: number
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          id?: string
          notes?: string | null
          status?: string
          unit_price_per_extra_location?: number
          updated_at?: string
        }
        Relationships: []
      }
      chain_addon_pricing_history: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          pricing_id: string
          reason: string | null
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          pricing_id: string
          reason?: string | null
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          pricing_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chain_addon_pricing_history_pricing_id_fkey"
            columns: ["pricing_id"]
            isOneToOne: false
            referencedRelation: "chain_addon_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      client_account_preferences: {
        Row: {
          created_at: string
          email_booking_updates: boolean
          id: string
          marketing_opt_in: boolean
          sms_booking_updates: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_booking_updates?: boolean
          id?: string
          marketing_opt_in?: boolean
          sms_booking_updates?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_booking_updates?: boolean
          id?: string
          marketing_opt_in?: boolean
          sms_booking_updates?: boolean
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
          currency: string
          customer_id: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          customer_id: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
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
      customer_reactivation_campaigns: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          filters_json: Json
          id: string
          name: string
          status: string
          template_json: Json
          tenant_id: string
          termii_device_id: string | null
          termii_template_id: string | null
          updated_at: string
          voucher_config_json: Json | null
          whatsapp_provider: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          filters_json?: Json
          id?: string
          name: string
          status?: string
          template_json?: Json
          tenant_id: string
          termii_device_id?: string | null
          termii_template_id?: string | null
          updated_at?: string
          voucher_config_json?: Json | null
          whatsapp_provider?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          filters_json?: Json
          id?: string
          name?: string
          status?: string
          template_json?: Json
          tenant_id?: string
          termii_device_id?: string | null
          termii_template_id?: string | null
          updated_at?: string
          voucher_config_json?: Json | null
          whatsapp_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_reactivation_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reactivation_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_reactivation_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string
          error_message: string | null
          id: string
          preview_payload_json: Json
          send_status: string
          sent_at: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id: string
          error_message?: string | null
          id?: string
          preview_payload_json?: Json
          send_status?: string
          sent_at?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string
          error_message?: string | null
          id?: string
          preview_payload_json?: Json
          send_status?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_reactivation_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "customer_reactivation_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_reactivation_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      domain_orders: {
        Row: {
          created_at: string
          domain_name: string
          dotlet_order_id: string | null
          id: string
          price_amount: number | null
          price_currency: string | null
          status: Database["public"]["Enums"]["domain_order_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain_name: string
          dotlet_order_id?: string | null
          id?: string
          price_amount?: number | null
          price_currency?: string | null
          status?: Database["public"]["Enums"]["domain_order_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain_name?: string
          dotlet_order_id?: string | null
          id?: string
          price_amount?: number | null
          price_currency?: string | null
          status?: Database["public"]["Enums"]["domain_order_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_orders_tenant_id_fkey"
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
          feature_id: string | null
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
          feature_id?: string | null
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
          feature_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "feature_flags_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: true
            referencedRelation: "platform_features"
            referencedColumns: ["id"]
          },
        ]
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
          payment_intent_id: string | null
          payment_link: string | null
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
          payment_intent_id?: string | null
          payment_link?: string | null
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
          payment_intent_id?: string | null
          payment_link?: string | null
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
            foreignKeyName: "invoices_payment_intent_id_fkey"
            columns: ["payment_intent_id"]
            isOneToOne: false
            referencedRelation: "payment_intents"
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
      manual_messages: {
        Row: {
          channel: string
          created_at: string
          credits_used: number | null
          customer_id: string
          error_message: string | null
          id: string
          message: string
          sent_at: string | null
          sent_by_user_id: string | null
          status: string
          subject: string | null
          template_id: string | null
          template_variables: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          credits_used?: number | null
          customer_id: string
          error_message?: string | null
          id?: string
          message: string
          sent_at?: string | null
          sent_by_user_id?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          template_variables?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          credits_used?: number | null
          customer_id?: string
          error_message?: string | null
          id?: string
          message?: string
          sent_at?: string | null
          sent_by_user_id?: string | null
          status?: string
          subject?: string | null
          template_id?: string | null
          template_variables?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      market_countries: {
        Row: {
          country_code: string
          country_name: string
          created_at: string
          go_live_at: string | null
          is_selectable: boolean
          legal_status: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          country_code: string
          country_name: string
          created_at?: string
          go_live_at?: string | null
          is_selectable?: boolean
          legal_status?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          country_code?: string
          country_name?: string
          created_at?: string
          go_live_at?: string | null
          is_selectable?: boolean
          legal_status?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      market_country_currency: {
        Row: {
          country_code: string
          created_at: string
          currency_code: string
          id: string
          is_default: boolean
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          currency_code: string
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          currency_code?: string
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_country_currency_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "market_countries"
            referencedColumns: ["country_code"]
          },
        ]
      }
      market_interest_leads: {
        Row: {
          city: string
          country: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone_e164: string
          salon_name: string
          source: string
          status: string
          team_size: number | null
          updated_at: string
        }
        Insert: {
          city: string
          country: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone_e164: string
          salon_name: string
          source: string
          status?: string
          team_size?: number | null
          updated_at?: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone_e164?: string
          salon_name?: string
          source?: string
          status?: string
          team_size?: number | null
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
          initiated_by: string | null
          provider: string | null
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
          template_type: string | null
          tenant_id: string
          termii_device_id: string | null
          termii_message_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          credits_used?: number
          customer_id?: string | null
          error_message?: string | null
          id?: string
          initiated_by?: string | null
          provider?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_type?: string | null
          tenant_id: string
          termii_device_id?: string | null
          termii_message_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          credits_used?: number
          customer_id?: string | null
          error_message?: string | null
          id?: string
          initiated_by?: string | null
          provider?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_type?: string | null
          tenant_id?: string
          termii_device_id?: string | null
          termii_message_id?: string | null
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
      messaging_credit_purchases: {
        Row: {
          amount: number
          created_at: string | null
          credits: number
          currency: string
          gateway_reference: string | null
          id: string
          paid_via: string
          payment_intent_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          credits: number
          currency: string
          gateway_reference?: string | null
          id?: string
          paid_via: string
          payment_intent_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          credits?: number
          currency?: string
          gateway_reference?: string | null
          id?: string
          paid_via?: string
          payment_intent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_messaging_credit_purchases_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_messaging_credit_purchases_tenant"
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
          email_transaction_alerts: boolean
          id: string
          in_app_transaction_alerts: boolean
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
          email_transaction_alerts?: boolean
          id?: string
          in_app_transaction_alerts?: boolean
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
          email_transaction_alerts?: boolean
          id?: string
          in_app_transaction_alerts?: boolean
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
          location_id: string | null
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
          location_id?: string | null
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
          location_id?: string | null
          read?: boolean
          tenant_id?: string
          title?: string
          type?: string
          urgent?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
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
      package_locations: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          location_id: string
          package_id: string
          price_override: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id: string
          package_id: string
          price_override?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string
          package_id?: string
          price_override?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_locations_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          archive_reason: string | null
          created_at: string
          deleted_at: string | null
          deleted_by_id: string | null
          deletion_reason: string | null
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
          archive_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_id?: string | null
          deletion_reason?: string | null
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
          archive_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_id?: string | null
          deletion_reason?: string | null
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
          intent_type: string | null
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
          intent_type?: string | null
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
          intent_type?: string | null
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
      phone_otp_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          otp_hash: string
          phone: string
          used: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          otp_hash: string
          phone: string
          used?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          phone?: string
          used?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      plan_change_batches: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          plan_id: string
          reason: string
          rolled_out_at: string | null
          rollout_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          plan_id: string
          reason: string
          rolled_out_at?: string | null
          rollout_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          plan_id?: string
          reason?: string
          rolled_out_at?: string | null
          rollout_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_batches_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_change_batches_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_plans_without_active_pricing"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_change_notifications: {
        Row: {
          batch_id: string
          created_at: string
          cta_opened_at: string | null
          dismissed_at: string | null
          id: string
          seen_at: string | null
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          cta_opened_at?: string | null
          dismissed_at?: string | null
          id?: string
          seen_at?: string | null
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          cta_opened_at?: string | null
          dismissed_at?: string | null
          id?: string
          seen_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_notifications_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "plan_change_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_change_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_change_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_change_targets: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          subscription_id: string | null
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          subscription_id?: string | null
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          subscription_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_targets_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "plan_change_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_change_targets_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_change_targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_change_targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_change_versions: {
        Row: {
          batch_id: string
          change_summary_json: Json
          created_at: string
          id: string
          limits_json: Json
          plan_core_json: Json
          pricing_json: Json
        }
        Insert: {
          batch_id: string
          change_summary_json?: Json
          created_at?: string
          id?: string
          limits_json?: Json
          plan_core_json?: Json
          pricing_json?: Json
        }
        Update: {
          batch_id?: string
          change_summary_json?: Json
          created_at?: string
          id?: string
          limits_json?: Json
          plan_core_json?: Json
          pricing_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_versions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "plan_change_batches"
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
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_plans_without_active_pricing"
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
          {
            foreignKeyName: "plan_limits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "v_plans_without_active_pricing"
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
          paystack_plan_code_annual: string | null
          paystack_plan_code_monthly: string | null
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
          paystack_plan_code_annual?: string | null
          paystack_plan_code_monthly?: string | null
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
          paystack_plan_code_annual?: string | null
          paystack_plan_code_monthly?: string | null
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
          {
            foreignKeyName: "plan_pricing_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_plans_without_active_pricing"
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
      platform_features: {
        Row: {
          app_scope: string
          created_at: string
          default_enabled: boolean
          description: string | null
          display_name: string
          feature_key: string
          id: string
          master_enabled: boolean
          owner_team: string | null
          status: string
          updated_at: string
        }
        Insert: {
          app_scope?: string
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          display_name: string
          feature_key: string
          id?: string
          master_enabled?: boolean
          owner_team?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          app_scope?: string
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          display_name?: string
          feature_key?: string
          id?: string
          master_enabled?: boolean
          owner_team?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_message_templates: {
        Row: {
          body: string
          category: string
          channel: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          subject: string | null
          template_key: string
          updated_at: string
        }
        Insert: {
          body: string
          category: string
          channel: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          subject?: string | null
          template_key: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          channel?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          subject?: string | null
          template_key?: string
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
      product_locations: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          location_id: string
          price_override: number | null
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id: string
          price_override?: number | null
          product_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string
          price_override?: number | null
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archive_reason: string | null
          created_at: string
          deleted_at: string | null
          deleted_by_id: string | null
          deletion_reason: string | null
          description: string | null
          flag_reason: string | null
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
          archive_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_id?: string | null
          deletion_reason?: string | null
          description?: string | null
          flag_reason?: string | null
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
          archive_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_id?: string | null
          deletion_reason?: string | null
          description?: string | null
          flag_reason?: string | null
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
          client_password_initialized: boolean
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          client_password_initialized?: boolean
          created_at?: string
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          client_password_initialized?: boolean
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
      sales_agent_documents: {
        Row: {
          created_at: string
          document_type: string
          id: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          sales_agent_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          document_type: string
          id?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_agent_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          document_type?: string
          id?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_agent_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_agent_documents_sales_agent_id_fkey"
            columns: ["sales_agent_id"]
            isOneToOne: false
            referencedRelation: "sales_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_agent_kyc: {
        Row: {
          created_at: string
          id: string
          legal_full_name: string | null
          national_id_number: string | null
          national_id_type: string | null
          next_of_kin_name: string | null
          next_of_kin_phone: string | null
          past_workplace: string | null
          reference_person_name: string | null
          reference_person_phone: string | null
          sales_agent_id: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          created_at?: string
          id?: string
          legal_full_name?: string | null
          national_id_number?: string | null
          national_id_type?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          past_workplace?: string | null
          reference_person_name?: string | null
          reference_person_phone?: string | null
          sales_agent_id: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          created_at?: string
          id?: string
          legal_full_name?: string | null
          national_id_number?: string | null
          national_id_type?: string | null
          next_of_kin_name?: string | null
          next_of_kin_phone?: string | null
          past_workplace?: string | null
          reference_person_name?: string | null
          reference_person_phone?: string | null
          sales_agent_id?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_agent_kyc_sales_agent_id_fkey"
            columns: ["sales_agent_id"]
            isOneToOne: true
            referencedRelation: "sales_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_agents: {
        Row: {
          backoffice_user_id: string
          country_code: string
          created_at: string
          created_by: string | null
          employment_status: string
          hire_date: string | null
          id: string
          monthly_base_salary: number
          updated_at: string
        }
        Insert: {
          backoffice_user_id: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          employment_status?: string
          hire_date?: string | null
          id?: string
          monthly_base_salary?: number
          updated_at?: string
        }
        Update: {
          backoffice_user_id?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          employment_status?: string
          hire_date?: string | null
          id?: string
          monthly_base_salary?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_agents_backoffice_user_id_fkey"
            columns: ["backoffice_user_id"]
            isOneToOne: true
            referencedRelation: "backoffice_users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_commission_ledger: {
        Row: {
          agent_id: string
          base_commission: number
          bonus_amount: number
          created_at: string
          id: string
          payment_reference: string | null
          promo_code_id: string | null
          settled_at: string | null
          status: string
          tenant_id: string | null
          tier_label: string | null
          total_amount: number
        }
        Insert: {
          agent_id: string
          base_commission?: number
          bonus_amount?: number
          created_at?: string
          id?: string
          payment_reference?: string | null
          promo_code_id?: string | null
          settled_at?: string | null
          status?: string
          tenant_id?: string | null
          tier_label?: string | null
          total_amount?: number
        }
        Update: {
          agent_id?: string
          base_commission?: number
          bonus_amount?: number
          created_at?: string
          id?: string
          payment_reference?: string | null
          promo_code_id?: string | null
          settled_at?: string | null
          status?: string
          tenant_id?: string | null
          tier_label?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_commission_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "sales_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commission_ledger_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "sales_promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commission_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_commission_ledger_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_promo_campaigns: {
        Row: {
          billing_targets: string[]
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          email_body_template: string | null
          email_subject_template: string | null
          enable_trial_extension: boolean
          ends_at: string
          id: string
          is_active: boolean
          max_uses_per_tenant: number
          name: string
          starts_at: string
          trial_extension_days: number
          updated_at: string
        }
        Insert: {
          billing_targets?: string[]
          created_at?: string
          created_by?: string | null
          discount_type: string
          discount_value: number
          email_body_template?: string | null
          email_subject_template?: string | null
          enable_trial_extension?: boolean
          ends_at: string
          id?: string
          is_active?: boolean
          max_uses_per_tenant?: number
          name: string
          starts_at: string
          trial_extension_days?: number
          updated_at?: string
        }
        Update: {
          billing_targets?: string[]
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          email_body_template?: string | null
          email_subject_template?: string | null
          enable_trial_extension?: boolean
          ends_at?: string
          id?: string
          is_active?: boolean
          max_uses_per_tenant?: number
          name?: string
          starts_at?: string
          trial_extension_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      sales_promo_codes: {
        Row: {
          agent_id: string
          campaign_id: string
          claimed_at: string | null
          claimed_by_user_id: string | null
          claimed_tenant_id: string | null
          code: string
          created_at: string
          expires_at: string
          id: string
          invalidated_at: string | null
          invalidated_by: string | null
          invalidation_reason: string | null
          is_one_time: boolean
          last_sent_at: string | null
          redeemed_at: string | null
          send_count: number
          status: string
          target_email: string
          target_first_name: string | null
        }
        Insert: {
          agent_id: string
          campaign_id: string
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          claimed_tenant_id?: string | null
          code: string
          created_at?: string
          expires_at: string
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          is_one_time?: boolean
          last_sent_at?: string | null
          redeemed_at?: string | null
          send_count?: number
          status?: string
          target_email: string
          target_first_name?: string | null
        }
        Update: {
          agent_id?: string
          campaign_id?: string
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          claimed_tenant_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          is_one_time?: boolean
          last_sent_at?: string | null
          redeemed_at?: string | null
          send_count?: number
          status?: string
          target_email?: string
          target_first_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_promo_codes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "sales_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_codes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sales_promo_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_codes_claimed_tenant_id_fkey"
            columns: ["claimed_tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_codes_claimed_tenant_id_fkey"
            columns: ["claimed_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_promo_redemptions: {
        Row: {
          billing_targets: string[]
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string
          discount_snapshot: Json
          email_match: boolean
          finalized_at: string | null
          id: string
          invalidated_at: string | null
          invalidated_by: string | null
          invalidation_reason: string | null
          last_surface: string | null
          last_used_at: string | null
          max_uses: number
          owner_email: string
          owner_user_id: string | null
          promo_code_id: string
          provider_reference: string | null
          remaining_uses: number
          status: string
          tenant_id: string | null
          trial_extension_days: number
          uses_consumed: number
        }
        Insert: {
          billing_targets?: string[]
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          discount_snapshot?: Json
          email_match?: boolean
          finalized_at?: string | null
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          last_surface?: string | null
          last_used_at?: string | null
          max_uses?: number
          owner_email: string
          owner_user_id?: string | null
          promo_code_id: string
          provider_reference?: string | null
          remaining_uses?: number
          status?: string
          tenant_id?: string | null
          trial_extension_days?: number
          uses_consumed?: number
        }
        Update: {
          billing_targets?: string[]
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          discount_snapshot?: Json
          email_match?: boolean
          finalized_at?: string | null
          id?: string
          invalidated_at?: string | null
          invalidated_by?: string | null
          invalidation_reason?: string | null
          last_surface?: string | null
          last_used_at?: string | null
          max_uses?: number
          owner_email?: string
          owner_user_id?: string | null
          promo_code_id?: string
          provider_reference?: string | null
          remaining_uses?: number
          status?: string
          tenant_id?: string | null
          trial_extension_days?: number
          uses_consumed?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "sales_promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_promo_usage_events: {
        Row: {
          amount: number | null
          consumed_at: string | null
          created_at: string
          discount_type: string | null
          discount_value: number | null
          id: string
          promo_code_id: string
          redemption_id: string
          status: string
          surface: string
          tenant_id: string
          usage_reference: string
        }
        Insert: {
          amount?: number | null
          consumed_at?: string | null
          created_at?: string
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          promo_code_id: string
          redemption_id: string
          status?: string
          surface: string
          tenant_id: string
          usage_reference: string
        }
        Update: {
          amount?: number | null
          consumed_at?: string | null
          created_at?: string
          discount_type?: string | null
          discount_value?: number | null
          id?: string
          promo_code_id?: string
          redemption_id?: string
          status?: string
          surface?: string
          tenant_id?: string
          usage_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_promo_usage_events_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "sales_promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_usage_events_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "sales_promo_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_promo_usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_targets: {
        Row: {
          agent_id: string
          bonus_rules: Json
          commission_tiers: Json
          created_at: string
          id: string
          monthly_base_salary: number
          updated_at: string
          week_end: string
          week_start: string
          weekly_target: number
        }
        Insert: {
          agent_id: string
          bonus_rules?: Json
          commission_tiers?: Json
          created_at?: string
          id?: string
          monthly_base_salary?: number
          updated_at?: string
          week_end: string
          week_start: string
          weekly_target?: number
        }
        Update: {
          agent_id?: string
          bonus_rules?: Json
          commission_tiers?: Json
          created_at?: string
          id?: string
          monthly_base_salary?: number
          updated_at?: string
          week_end?: string
          week_start?: string
          weekly_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "sales_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_payout_destinations: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_code: string | null
          bank_name: string | null
          country: string
          created_at: string | null
          currency: string
          destination_type: Database["public"]["Enums"]["payout_destination_type"]
          id: string
          is_default: boolean | null
          location_id: string | null
          momo_number: string | null
          momo_provider: string | null
          paystack_recipient_code: string | null
          paystack_subaccount_active: boolean | null
          paystack_subaccount_code: string | null
          paystack_subaccount_error: string | null
          paystack_subaccount_id: number | null
          paystack_subaccount_status: string | null
          settlement_schedule: string
          tenant_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          country: string
          created_at?: string | null
          currency: string
          destination_type: Database["public"]["Enums"]["payout_destination_type"]
          id?: string
          is_default?: boolean | null
          location_id?: string | null
          momo_number?: string | null
          momo_provider?: string | null
          paystack_recipient_code?: string | null
          paystack_subaccount_active?: boolean | null
          paystack_subaccount_code?: string | null
          paystack_subaccount_error?: string | null
          paystack_subaccount_id?: number | null
          paystack_subaccount_status?: string | null
          settlement_schedule?: string
          tenant_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_code?: string | null
          bank_name?: string | null
          country?: string
          created_at?: string | null
          currency?: string
          destination_type?: Database["public"]["Enums"]["payout_destination_type"]
          id?: string
          is_default?: boolean | null
          location_id?: string | null
          momo_number?: string | null
          momo_provider?: string | null
          paystack_recipient_code?: string | null
          paystack_subaccount_active?: boolean | null
          paystack_subaccount_code?: string | null
          paystack_subaccount_error?: string | null
          paystack_subaccount_id?: number | null
          paystack_subaccount_status?: string | null
          settlement_schedule?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_salon_payout_destinations_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_salon_payout_destinations_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_payout_destinations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_wallets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_salon_wallets_tenant"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_salon_wallets_tenant"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_withdrawals: {
        Row: {
          amount: number
          currency: string
          failure_reason: string | null
          id: string
          payout_destination_id: string
          paystack_reference: string | null
          paystack_transfer_code: string | null
          requested_at: string | null
          salon_wallet_id: string
          status: Database["public"]["Enums"]["withdrawal_status"] | null
          tenant_id: string
        }
        Insert: {
          amount: number
          currency: string
          failure_reason?: string | null
          id?: string
          payout_destination_id: string
          paystack_reference?: string | null
          paystack_transfer_code?: string | null
          requested_at?: string | null
          salon_wallet_id: string
          status?: Database["public"]["Enums"]["withdrawal_status"] | null
          tenant_id: string
        }
        Update: {
          amount?: number
          currency?: string
          failure_reason?: string | null
          id?: string
          payout_destination_id?: string
          paystack_reference?: string | null
          paystack_transfer_code?: string | null
          requested_at?: string | null
          salon_wallet_id?: string
          status?: Database["public"]["Enums"]["withdrawal_status"] | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_salon_withdrawals_destination"
            columns: ["payout_destination_id"]
            isOneToOne: false
            referencedRelation: "salon_payout_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_salon_withdrawals_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_salon_withdrawals_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_salon_withdrawals_wallet"
            columns: ["salon_wallet_id"]
            isOneToOne: false
            referencedRelation: "salon_wallets"
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
      service_locations: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          location_id: string
          price_override: number | null
          service_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id: string
          price_override?: number | null
          service_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string
          price_override?: number | null
          service_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_locations_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          archive_reason: string | null
          category_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by_id: string | null
          deletion_reason: string | null
          deposit_amount: number | null
          deposit_percentage: number | null
          deposit_required: boolean
          description: string | null
          duration_minutes: number
          flag_reason: string | null
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
          archive_reason?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_id?: string | null
          deletion_reason?: string | null
          deposit_amount?: number | null
          deposit_percentage?: number | null
          deposit_required?: boolean
          description?: string | null
          duration_minutes?: number
          flag_reason?: string | null
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
          archive_reason?: string | null
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_id?: string | null
          deletion_reason?: string | null
          deposit_amount?: number | null
          deposit_percentage?: number | null
          deposit_required?: boolean
          description?: string | null
          duration_minutes?: number
          flag_reason?: string | null
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
      setup_assistance_requests: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          request_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          request_type?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          request_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_assistance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_assistance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          auto_send_enabled: boolean | null
          auto_send_trigger: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          message: string
          template_type: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          auto_send_enabled?: boolean | null
          auto_send_trigger?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          template_type: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          auto_send_enabled?: boolean | null
          auto_send_trigger?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          template_type?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_addon_pricing: {
        Row: {
          country_code: string
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          id: string
          notes: string | null
          status: string
          unit_price_per_extra_seat: number
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          created_by?: string | null
          currency: string
          effective_from?: string
          id?: string
          notes?: string | null
          status?: string
          unit_price_per_extra_seat: number
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          id?: string
          notes?: string | null
          status?: string
          unit_price_per_extra_seat?: number
          updated_at?: string
        }
        Relationships: []
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
          password_changed_at: string | null
          phone: string | null
          resend_count: number | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          temp_password: string | null
          temp_password_used: boolean | null
          tenant_id: string
          token: string
          user_id: string | null
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
          password_changed_at?: string | null
          phone?: string | null
          resend_count?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          temp_password?: string | null
          temp_password_used?: boolean | null
          tenant_id: string
          token: string
          user_id?: string | null
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
          password_changed_at?: string | null
          phone?: string | null
          resend_count?: number | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          temp_password?: string | null
          temp_password_used?: boolean | null
          tenant_id?: string
          token?: string
          user_id?: string | null
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
      staff_location_services: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          location_id: string
          service_id: string
          staff_user_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id: string
          service_id: string
          staff_user_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string
          service_id?: string
          staff_user_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_location_services_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_location_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_location_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_location_services_tenant_id_fkey"
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
      staff_service_categories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_enabled: boolean
          location_id: string | null
          staff_user_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string | null
          staff_user_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string | null
          staff_user_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_service_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_service_categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_service_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_service_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          location_id: string | null
          service_id: string
          staff_user_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string | null
          service_id: string
          staff_user_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string | null
          service_id?: string
          staff_user_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_sessions: {
        Row: {
          active_context_type: string | null
          active_location_id: string | null
          browser_name: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          end_reason: string | null
          ended_at: string | null
          id: string
          ip_address: string | null
          last_activity_at: string
          last_page_view_at: string | null
          last_route: string | null
          location_id: string | null
          region: string | null
          session_token: string | null
          started_at: string
          tenant_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          active_context_type?: string | null
          active_location_id?: string | null
          browser_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          last_activity_at?: string
          last_page_view_at?: string | null
          last_route?: string | null
          location_id?: string | null
          region?: string | null
          session_token?: string | null
          started_at?: string
          tenant_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          active_context_type?: string | null
          active_location_id?: string | null
          browser_name?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          last_activity_at?: string
          last_page_view_at?: string | null
          last_route?: string | null
          location_id?: string | null
          region?: string | null
          session_token?: string | null
          started_at?: string
          tenant_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_sessions_active_location_id_fkey"
            columns: ["active_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_plans_without_active_pricing"
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
      support_tickets: {
        Row: {
          assigned_backoffice_user_id: string | null
          body: string
          created_at: string
          id: string
          issue_type: string
          priority: string
          requester_email: string | null
          requester_phone: string | null
          requester_user_id: string | null
          resolved_at: string | null
          sla_due_at: string | null
          source_app: string
          status: string
          subject: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_backoffice_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          issue_type: string
          priority?: string
          requester_email?: string | null
          requester_phone?: string | null
          requester_user_id?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          source_app: string
          status?: string
          subject: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_backoffice_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          issue_type?: string
          priority?: string
          requester_email?: string | null
          requester_phone?: string | null
          requester_user_id?: string | null
          resolved_at?: string | null
          sla_due_at?: string | null
          source_app?: string
          status?: string
          subject?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_backoffice_user_id_fkey"
            columns: ["assigned_backoffice_user_id"]
            isOneToOne: false
            referencedRelation: "backoffice_users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_addon_entitlements: {
        Row: {
          addon_key: string | null
          addon_type: string
          billing_interval: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          pricing_id: string | null
          quantity: number
          reason: string | null
          source: string
          started_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          addon_key?: string | null
          addon_type: string
          billing_interval: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          pricing_id?: string | null
          quantity?: number
          reason?: string | null
          source: string
          started_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          addon_key?: string | null
          addon_type?: string
          billing_interval?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          pricing_id?: string | null
          quantity?: number
          reason?: string | null
          source?: string
          started_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_addon_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_addon_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_addon_quotes: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          active_locations: number
          addon_key: string | null
          addon_type: string
          billing_interval: string
          country_code: string
          created_at: string
          currency: string
          extra_locations: number
          id: string
          included_locations: number
          monthly_addon_total: number
          pricing_id: string | null
          quantity: number
          snapshot: Json
          status: string
          tenant_id: string
          total_price: number
          unit_price: number
          unit_price_per_extra_location: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          active_locations?: number
          addon_key?: string | null
          addon_type?: string
          billing_interval?: string
          country_code: string
          created_at?: string
          currency: string
          extra_locations?: number
          id?: string
          included_locations?: number
          monthly_addon_total?: number
          pricing_id?: string | null
          quantity?: number
          snapshot?: Json
          status?: string
          tenant_id: string
          total_price?: number
          unit_price?: number
          unit_price_per_extra_location?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          active_locations?: number
          addon_key?: string | null
          addon_type?: string
          billing_interval?: string
          country_code?: string
          created_at?: string
          currency?: string
          extra_locations?: number
          id?: string
          included_locations?: number
          monthly_addon_total?: number
          pricing_id?: string | null
          quantity?: number
          snapshot?: Json
          status?: string
          tenant_id?: string
          total_price?: number
          unit_price?: number
          unit_price_per_extra_location?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_addon_quotes_pricing_id_fkey"
            columns: ["pricing_id"]
            isOneToOne: false
            referencedRelation: "chain_addon_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_addon_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_addon_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_chain_unlock_requests: {
        Row: {
          allowed_locations: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          custom_unlock_amount: number | null
          custom_unlock_currency: string | null
          id: string
          plan_id: string
          reason: string | null
          requested_by: string | null
          requested_locations: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allowed_locations?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          custom_unlock_amount?: number | null
          custom_unlock_currency?: string | null
          id?: string
          plan_id: string
          reason?: string | null
          requested_by?: string | null
          requested_locations: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allowed_locations?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          custom_unlock_amount?: number | null
          custom_unlock_currency?: string | null
          id?: string
          plan_id?: string
          reason?: string | null
          requested_by?: string | null
          requested_locations?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_chain_unlock_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_chain_unlock_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_plans_without_active_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_chain_unlock_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_chain_unlock_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_location_overage_events: {
        Row: {
          added_count: number
          billing_effective_at: string
          created_at: string
          currency: string
          id: string
          locations_after: number
          locations_before: number
          metadata: Json
          plan_id: string
          source: string
          status: string
          subtotal: number | null
          tenant_id: string
          unit_price: number | null
        }
        Insert: {
          added_count: number
          billing_effective_at: string
          created_at?: string
          currency: string
          id?: string
          locations_after: number
          locations_before: number
          metadata?: Json
          plan_id: string
          source: string
          status?: string
          subtotal?: number | null
          tenant_id: string
          unit_price?: number | null
        }
        Update: {
          added_count?: number
          billing_effective_at?: string
          created_at?: string
          currency?: string
          id?: string
          locations_after?: number
          locations_before?: number
          metadata?: Json
          plan_id?: string
          source?: string
          status?: string
          subtotal?: number | null
          tenant_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_location_overage_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_location_overage_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_plans_without_active_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_location_overage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_location_overage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_plan_entitlements: {
        Row: {
          allowed_locations: number
          allowed_staff: number | null
          base_staff_per_location: number | null
          created_at: string
          id: string
          plan_id: string
          reason: string | null
          source: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_locations?: number
          allowed_staff?: number | null
          base_staff_per_location?: number | null
          created_at?: string
          id?: string
          plan_id: string
          reason?: string | null
          source: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_locations?: number
          allowed_staff?: number | null
          base_staff_per_location?: number | null
          created_at?: string
          id?: string
          plan_id?: string
          reason?: string | null
          source?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "v_plans_without_active_pricing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_plan_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_plan_entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_trial_overrides: {
        Row: {
          created_at: string
          ends_at: string
          granted_by: string | null
          id: string
          reason: string
          starts_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          granted_by?: string | null
          id?: string
          reason: string
          starts_at: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          granted_by?: string | null
          id?: string
          reason?: string
          starts_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_trial_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_trial_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          about_text: string | null
          allow_staff_selection: boolean
          auto_assign_staff: boolean
          auto_confirm_bookings: boolean | null
          banner_urls: string[] | null
          billing_retry_count: number
          booking_page_bio: string | null
          booking_status_message: string | null
          brand_color: string | null
          cancellation_grace_hours: number | null
          contact_phone: string | null
          country: string
          created_at: string
          currency: string
          custom_booking_domain: string | null
          custom_domain_source: string | null
          custom_domain_verified: boolean
          custom_domain_verified_at: string | null
          default_buffer_minutes: number | null
          default_deposit_percentage: number | null
          deposits_enabled: boolean
          dotlet_domain_id: string | null
          dotlet_origin_rule_id: string | null
          hero_cta_primary: string
          hero_cta_secondary: string
          hero_heading: string | null
          hero_tagline: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          min_withdrawal_ghs: number | null
          min_withdrawal_ngn: number | null
          name: string
          next_billing_at: string | null
          online_booking_enabled: boolean
          pay_at_salon_enabled: boolean
          payment_setup_error: string | null
          payment_setup_status: Database["public"]["Enums"]["payment_setup_status"]
          paystack_authorization_code: string | null
          paystack_authorization_email: string | null
          paystack_customer_code: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          platform_percentage_charge: number
          require_staff_selection: boolean
          show_contact_on_booking: boolean | null
          slot_capacity_default: number
          slug: string | null
          sms_provider: string
          sms_sender_name: string | null
          sms_sender_name_approved_at: string | null
          sms_sender_name_company: string | null
          sms_sender_name_requested_at: string | null
          sms_sender_name_status: string
          sms_sender_name_use_case: string | null
          storefront_mode: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          termii_device_id: string | null
          termii_sender_id: string | null
          termii_sender_id_approved_at: string | null
          termii_sender_id_company: string | null
          termii_sender_id_requested_at: string | null
          termii_sender_id_status: string | null
          termii_sender_id_use_case: string | null
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          about_text?: string | null
          allow_staff_selection?: boolean
          auto_assign_staff?: boolean
          auto_confirm_bookings?: boolean | null
          banner_urls?: string[] | null
          billing_retry_count?: number
          booking_page_bio?: string | null
          booking_status_message?: string | null
          brand_color?: string | null
          cancellation_grace_hours?: number | null
          contact_phone?: string | null
          country: string
          created_at?: string
          currency?: string
          custom_booking_domain?: string | null
          custom_domain_source?: string | null
          custom_domain_verified?: boolean
          custom_domain_verified_at?: string | null
          default_buffer_minutes?: number | null
          default_deposit_percentage?: number | null
          deposits_enabled?: boolean
          dotlet_domain_id?: string | null
          dotlet_origin_rule_id?: string | null
          hero_cta_primary?: string
          hero_cta_secondary?: string
          hero_heading?: string | null
          hero_tagline?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          min_withdrawal_ghs?: number | null
          min_withdrawal_ngn?: number | null
          name: string
          next_billing_at?: string | null
          online_booking_enabled?: boolean
          pay_at_salon_enabled?: boolean
          payment_setup_error?: string | null
          payment_setup_status?: Database["public"]["Enums"]["payment_setup_status"]
          paystack_authorization_code?: string | null
          paystack_authorization_email?: string | null
          paystack_customer_code?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          platform_percentage_charge?: number
          require_staff_selection?: boolean
          show_contact_on_booking?: boolean | null
          slot_capacity_default?: number
          slug?: string | null
          sms_provider?: string
          sms_sender_name?: string | null
          sms_sender_name_approved_at?: string | null
          sms_sender_name_company?: string | null
          sms_sender_name_requested_at?: string | null
          sms_sender_name_status?: string
          sms_sender_name_use_case?: string | null
          storefront_mode?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          termii_device_id?: string | null
          termii_sender_id?: string | null
          termii_sender_id_approved_at?: string | null
          termii_sender_id_company?: string | null
          termii_sender_id_requested_at?: string | null
          termii_sender_id_status?: string | null
          termii_sender_id_use_case?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          about_text?: string | null
          allow_staff_selection?: boolean
          auto_assign_staff?: boolean
          auto_confirm_bookings?: boolean | null
          banner_urls?: string[] | null
          billing_retry_count?: number
          booking_page_bio?: string | null
          booking_status_message?: string | null
          brand_color?: string | null
          cancellation_grace_hours?: number | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          currency?: string
          custom_booking_domain?: string | null
          custom_domain_source?: string | null
          custom_domain_verified?: boolean
          custom_domain_verified_at?: string | null
          default_buffer_minutes?: number | null
          default_deposit_percentage?: number | null
          deposits_enabled?: boolean
          dotlet_domain_id?: string | null
          dotlet_origin_rule_id?: string | null
          hero_cta_primary?: string
          hero_cta_secondary?: string
          hero_heading?: string | null
          hero_tagline?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          min_withdrawal_ghs?: number | null
          min_withdrawal_ngn?: number | null
          name?: string
          next_billing_at?: string | null
          online_booking_enabled?: boolean
          pay_at_salon_enabled?: boolean
          payment_setup_error?: string | null
          payment_setup_status?: Database["public"]["Enums"]["payment_setup_status"]
          paystack_authorization_code?: string | null
          paystack_authorization_email?: string | null
          paystack_customer_code?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          platform_percentage_charge?: number
          require_staff_selection?: boolean
          show_contact_on_booking?: boolean | null
          slot_capacity_default?: number
          slug?: string | null
          sms_provider?: string
          sms_sender_name?: string | null
          sms_sender_name_approved_at?: string | null
          sms_sender_name_company?: string | null
          sms_sender_name_requested_at?: string | null
          sms_sender_name_status?: string
          sms_sender_name_use_case?: string | null
          storefront_mode?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          termii_device_id?: string | null
          termii_sender_id?: string | null
          termii_sender_id_approved_at?: string | null
          termii_sender_id_company?: string | null
          termii_sender_id_requested_at?: string | null
          termii_sender_id_status?: string | null
          termii_sender_id_use_case?: string | null
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      theme_addon_pricing: {
        Row: {
          billing_interval: string
          country_code: string
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          id: string
          notes: string | null
          status: string
          theme_key: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          country_code: string
          created_at?: string
          created_by?: string | null
          currency: string
          effective_from?: string
          id?: string
          notes?: string | null
          status?: string
          theme_key: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          id?: string
          notes?: string | null
          status?: string
          theme_key?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theme_addon_pricing_theme_key_fkey"
            columns: ["theme_key"]
            isOneToOne: false
            referencedRelation: "theme_catalog"
            referencedColumns: ["theme_key"]
          },
        ]
      }
      theme_catalog: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          theme_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          theme_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          theme_key?: string
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
          payment_group_id: string | null
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
          payment_group_id?: string | null
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
          payment_group_id?: string | null
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
          can_manage_staff_sessions: boolean
          created_at: string
          id: string
          is_active: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          can_manage_staff_sessions?: boolean
          created_at?: string
          id?: string
          is_active?: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          can_manage_staff_sessions?: boolean
          created_at?: string
          id?: string
          is_active?: boolean | null
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
      voucher_locations: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          location_id: string
          tenant_id: string
          updated_at: string
          voucher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id: string
          tenant_id: string
          updated_at?: string
          voucher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          location_id?: string
          tenant_id?: string
          updated_at?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_locations_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
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
          deleted_at: string | null
          deleted_by_id: string | null
          deletion_reason: string | null
          discontinue_reason: string | null
          expires_at: string | null
          id: string
          is_flagged: boolean | null
          issued_for_campaign_id: string | null
          purchased_by_customer_id: string | null
          redeemed_by_customer_id: string | null
          scope_ids: string[]
          scope_type: string
          status: string
          target_customer_id: string | null
          tenant_id: string
          updated_at: string
          voucher_kind: string
        }
        Insert: {
          amount: number
          balance: number
          code: string
          created_at?: string
          deleted_at?: string | null
          deleted_by_id?: string | null
          deletion_reason?: string | null
          discontinue_reason?: string | null
          expires_at?: string | null
          id?: string
          is_flagged?: boolean | null
          issued_for_campaign_id?: string | null
          purchased_by_customer_id?: string | null
          redeemed_by_customer_id?: string | null
          scope_ids?: string[]
          scope_type?: string
          status?: string
          target_customer_id?: string | null
          tenant_id: string
          updated_at?: string
          voucher_kind?: string
        }
        Update: {
          amount?: number
          balance?: number
          code?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by_id?: string | null
          deletion_reason?: string | null
          discontinue_reason?: string | null
          expires_at?: string | null
          id?: string
          is_flagged?: boolean | null
          issued_for_campaign_id?: string | null
          purchased_by_customer_id?: string | null
          redeemed_by_customer_id?: string | null
          scope_ids?: string[]
          scope_type?: string
          status?: string
          target_customer_id?: string | null
          tenant_id?: string
          updated_at?: string
          voucher_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_issued_for_campaign_id_fkey"
            columns: ["issued_for_campaign_id"]
            isOneToOne: false
            referencedRelation: "customer_reactivation_campaigns"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "vouchers_target_customer_id_fkey"
            columns: ["target_customer_id"]
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
      wallet_ledger_entries: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          currency: string
          entry_type: Database["public"]["Enums"]["wallet_entry_type"]
          gateway: string | null
          gateway_reference: string | null
          id: string
          idempotency_key: string | null
          metadata: Json
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          wallet_id: string
          wallet_type: Database["public"]["Enums"]["wallet_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          currency: string
          entry_type: Database["public"]["Enums"]["wallet_entry_type"]
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          wallet_id: string
          wallet_type: Database["public"]["Enums"]["wallet_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          currency?: string
          entry_type?: Database["public"]["Enums"]["wallet_entry_type"]
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          wallet_id?: string
          wallet_type?: Database["public"]["Enums"]["wallet_type"]
        }
        Relationships: [
          {
            foreignKeyName: "fk_wallet_ledger_entries_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_wallet_ledger_entries_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          created_at: string
          id: string
          provider: string
          status: string
          template_content: Json
          template_id: string | null
          template_name: string
          tenant_id: string
          updated_at: string
          variables: string[] | null
        }
        Insert: {
          created_at?: string
          id?: string
          provider?: string
          status?: string
          template_content: Json
          template_id?: string | null
          template_name: string
          tenant_id: string
          updated_at?: string
          variables?: string[] | null
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          status?: string
          template_content?: Json
          template_id?: string | null
          template_name?: string
          tenant_id?: string
          updated_at?: string
          variables?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "public_booking_tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
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
          about_text: string | null
          allow_staff_selection: boolean | null
          auto_assign_staff: boolean | null
          auto_confirm_bookings: boolean | null
          banner_urls: string[] | null
          booking_page_bio: string | null
          booking_status_message: string | null
          brand_color: string | null
          cancellation_grace_hours: number | null
          contact_phone: string | null
          country: string | null
          currency: string | null
          default_buffer_minutes: number | null
          default_deposit_percentage: number | null
          deposits_enabled: boolean | null
          hero_cta_primary: string | null
          hero_cta_secondary: string | null
          hero_heading: string | null
          hero_tagline: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          online_booking_enabled: boolean | null
          pay_at_salon_enabled: boolean | null
          payment_setup_status:
            | Database["public"]["Enums"]["payment_setup_status"]
            | null
          require_staff_selection: boolean | null
          show_contact_on_booking: boolean | null
          slot_capacity_default: number | null
          slug: string | null
          storefront_mode: string | null
          theme_key: string | null
          timezone: string | null
        }
        Insert: {
          about_text?: string | null
          allow_staff_selection?: boolean | null
          auto_assign_staff?: boolean | null
          auto_confirm_bookings?: boolean | null
          banner_urls?: string[] | null
          booking_page_bio?: string | null
          booking_status_message?: string | null
          brand_color?: string | null
          cancellation_grace_hours?: number | null
          contact_phone?: never
          country?: string | null
          currency?: string | null
          default_buffer_minutes?: number | null
          default_deposit_percentage?: number | null
          deposits_enabled?: boolean | null
          hero_cta_primary?: string | null
          hero_cta_secondary?: string | null
          hero_heading?: string | null
          hero_tagline?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          online_booking_enabled?: boolean | null
          pay_at_salon_enabled?: boolean | null
          payment_setup_status?:
            | Database["public"]["Enums"]["payment_setup_status"]
            | null
          require_staff_selection?: boolean | null
          show_contact_on_booking?: boolean | null
          slot_capacity_default?: number | null
          slug?: string | null
          storefront_mode?: string | null
          theme_key?: never
          timezone?: string | null
        }
        Update: {
          about_text?: string | null
          allow_staff_selection?: boolean | null
          auto_assign_staff?: boolean | null
          auto_confirm_bookings?: boolean | null
          banner_urls?: string[] | null
          booking_page_bio?: string | null
          booking_status_message?: string | null
          brand_color?: string | null
          cancellation_grace_hours?: number | null
          contact_phone?: never
          country?: string | null
          currency?: string | null
          default_buffer_minutes?: number | null
          default_deposit_percentage?: number | null
          deposits_enabled?: boolean | null
          hero_cta_primary?: string | null
          hero_cta_secondary?: string | null
          hero_heading?: string | null
          hero_tagline?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          online_booking_enabled?: boolean | null
          pay_at_salon_enabled?: boolean | null
          payment_setup_status?:
            | Database["public"]["Enums"]["payment_setup_status"]
            | null
          require_staff_selection?: boolean | null
          show_contact_on_booking?: boolean | null
          slot_capacity_default?: number | null
          slug?: string | null
          storefront_mode?: string | null
          theme_key?: never
          timezone?: string | null
        }
        Relationships: []
      }
      v_plans_without_active_pricing: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string | null
          is_active: boolean | null
          is_recommended: boolean | null
          name: string | null
          slug: string | null
          trial_days: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string | null
          is_active?: boolean | null
          is_recommended?: boolean | null
          name?: string | null
          slug?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string | null
          is_active?: boolean | null
          is_recommended?: boolean | null
          name?: string | null
          slug?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _apply_plan_change_batch_internal: {
        Args: {
          p_actor_user_id: string
          p_batch_id: string
          p_rollout_at?: string
          p_rollout_mode?: string
        }
        Returns: Json
      }
      apply_plan_configuration: {
        Args: {
          p_branches: number
          p_reason: string
          p_seats: number
          p_source: string
          p_tenant_id: string
        }
        Returns: Json
      }
      approve_chain_custom_unlock: {
        Args: {
          p_allowed_locations: number
          p_amount: number
          p_currency: string
          p_reason: string
          p_tenant_id: string
        }
        Returns: Json
      }
      assert_tenant_can_add_location: {
        Args: { p_tenant_id: string }
        Returns: {
          allowed: number
          can_add: boolean
          requires_custom: boolean
          used: number
        }[]
      }
      assert_tenant_can_add_staff: {
        Args: { p_tenant_id: string }
        Returns: {
          addon_type: string
          allowed: number
          can_add: boolean
          currency: string
          plan_slug: string
          required_plan: string
          unit_price: number
          used: number
        }[]
      }
      assign_staff_locations: {
        Args: {
          p_location_ids?: string[]
          p_tenant_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      backfill_missing_transactions: {
        Args: { p_tenant_id?: string }
        Returns: Json
      }
      backoffice_apply_plan_change_batch: {
        Args: {
          p_batch_id: string
          p_rollout_at?: string
          p_rollout_mode?: string
        }
        Returns: Json
      }
      backoffice_assign_user_role: {
        Args: { p_backoffice_user_id: string; p_role_id: string }
        Returns: {
          assigned_by: string | null
          backoffice_user_id: string
          created_at: string
          id: string
          role_template_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "backoffice_user_role_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backoffice_assign_user_template: {
        Args: { p_backoffice_user_id: string; p_role_template_id: string }
        Returns: {
          assigned_by: string | null
          backoffice_user_id: string
          created_at: string
          id: string
          role_template_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "backoffice_user_role_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backoffice_create_plan_change_batch: {
        Args: {
          p_change_summary_json: Json
          p_limits_json: Json
          p_plan_core_json: Json
          p_plan_id: string
          p_pricing_json: Json
          p_reason: string
          p_rollout_at?: string
          p_rollout_mode?: string
        }
        Returns: string
      }
      backoffice_create_role: {
        Args: {
          p_description: string
          p_name: string
          p_page_keys?: string[]
          p_permission_keys?: string[]
        }
        Returns: string
      }
      backoffice_create_role_template: {
        Args: {
          p_description: string
          p_name: string
          p_page_keys?: string[]
          p_permission_keys?: string[]
        }
        Returns: string
      }
      backoffice_delete_or_archive_plan: {
        Args: { p_challenge_id: string; p_plan_id: string; p_reason: string }
        Returns: Json
      }
      backoffice_generate_sales_promo_code:
        | {
            Args: {
              p_agent_id: string
              p_campaign_id: string
              p_target_email: string
            }
            Returns: {
              agent_id: string
              campaign_id: string
              claimed_at: string | null
              claimed_by_user_id: string | null
              claimed_tenant_id: string | null
              code: string
              created_at: string
              expires_at: string
              id: string
              invalidated_at: string | null
              invalidated_by: string | null
              invalidation_reason: string | null
              is_one_time: boolean
              last_sent_at: string | null
              redeemed_at: string | null
              send_count: number
              status: string
              target_email: string
              target_first_name: string | null
            }
            SetofOptions: {
              from: "*"
              to: "sales_promo_codes"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_agent_id: string
              p_campaign_id: string
              p_target_email: string
              p_target_first_name?: string
            }
            Returns: {
              agent_id: string
              campaign_id: string
              claimed_at: string | null
              claimed_by_user_id: string | null
              claimed_tenant_id: string | null
              code: string
              created_at: string
              expires_at: string
              id: string
              invalidated_at: string | null
              invalidated_by: string | null
              invalidation_reason: string | null
              is_one_time: boolean
              last_sent_at: string | null
              redeemed_at: string | null
              send_count: number
              status: string
              target_email: string
              target_first_name: string | null
            }
            SetofOptions: {
              from: "*"
              to: "sales_promo_codes"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      backoffice_get_effective_pages: { Args: never; Returns: string[] }
      backoffice_get_effective_permissions: { Args: never; Returns: string[] }
      backoffice_list_role_templates: {
        Args: never
        Returns: {
          description: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          pages: string[]
          permissions: string[]
        }[]
      }
      backoffice_list_roles_with_stats: {
        Args: never
        Returns: {
          access_pages_count: string
          access_subpages_count: string
          admins_count: number
          description: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          pages: string[]
          permissions: string[]
          permissions_count: string
        }[]
      }
      backoffice_list_team_members: {
        Args: never
        Returns: {
          base_role: string
          created_at: string
          email: string
          email_domain: string
          first_name: string
          full_name: string
          id: string
          is_active: boolean
          is_logged_in: boolean
          is_sales_agent: boolean
          last_activity_at: string
          last_login_at: string
          last_name: string
          phone: string
          role_name: string
          role_template_id: string
          status: string
          totp_enabled: boolean
          user_id: string
        }[]
      }
      backoffice_member_status: {
        Args: { p_is_active: boolean; p_temp_password_required: boolean }
        Returns: string
      }
      backoffice_set_marketing_feature_toggle: {
        Args: {
          p_challenge_id: string
          p_enabled: boolean
          p_feature_key: string
          p_reason: string
        }
        Returns: {
          feature_key: string
          master_enabled: boolean
          updated_at: string
        }[]
      }
      backoffice_update_plan_with_features: {
        Args: {
          p_description: string
          p_display_order: number
          p_features: Json
          p_is_active: boolean
          p_is_recommended: boolean
          p_max_locations: number
          p_max_products: number
          p_max_services: number
          p_max_staff: number
          p_monthly_messages: number
          p_name: string
          p_plan_id: string
          p_reason: string
          p_slug: string
          p_trial_days: number
        }
        Returns: string
      }
      backoffice_update_role: {
        Args: {
          p_description: string
          p_is_active?: boolean
          p_name: string
          p_page_keys?: string[]
          p_permission_keys?: string[]
          p_role_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "backoffice_role_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backoffice_update_role_template: {
        Args: {
          p_description: string
          p_is_active?: boolean
          p_name: string
          p_page_keys?: string[]
          p_permission_keys?: string[]
          p_template_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "backoffice_role_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backoffice_upsert_chain_location_pricing: {
        Args: { p_plan_id: string; p_reason: string; p_tiers: Json }
        Returns: Json
      }
      backoffice_upsert_feature_master_toggle: {
        Args: {
          p_challenge_id: string
          p_feature_id: string
          p_is_enabled: boolean
          p_reason: string
          p_schedule_end: string
          p_schedule_start: string
          p_scope: Database["public"]["Enums"]["feature_flag_scope"]
        }
        Returns: {
          created_at: string
          created_by_id: string | null
          description: string | null
          feature_id: string | null
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
        SetofOptions: {
          from: "*"
          to: "feature_flags"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backoffice_user_has_permission: {
        Args: { p_permission_key: string; p_user_id: string }
        Returns: boolean
      }
      belongs_to_tenant: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      claim_sales_promo_code: {
        Args: { p_code: string; p_surface?: string; p_tenant_id: string }
        Returns: Json
      }
      compute_chain_price: {
        Args: {
          p_currency: string
          p_plan_id: string
          p_total_locations: number
        }
        Returns: {
          breakdown: Json
          requires_custom: boolean
          total_price: number
        }[]
      }
      compute_current_addon_total: {
        Args: { p_tenant_id: string }
        Returns: {
          addon_total: number
          breakdown: Json
          currency: string
        }[]
      }
      compute_plan_configuration: {
        Args: { p_branches: number; p_seats: number; p_tenant_id: string }
        Returns: {
          currency: string
          current_allowed_locations: number
          current_allowed_staff: number
          current_monthly_price: number
          current_plan_slug: string
          price_delta: number
          required_plan_slug: string
          requires_custom_locations: boolean
          total_monthly_price: number
        }[]
      }
      consume_backoffice_step_up_challenge: {
        Args: {
          p_action: string
          p_challenge_id: string
          p_resource_id: string
        }
        Returns: undefined
      }
      consume_tenant_sales_promo_use: {
        Args: {
          p_amount?: number
          p_surface: string
          p_tenant_id: string
          p_usage_reference: string
        }
        Returns: Json
      }
      create_booking_invoice_for_approved_items: {
        Args: {
          p_appointment_ids?: string[]
          p_booking_reference?: string
          p_customer_id: string
          p_due_date?: string
          p_notes?: string
          p_tenant_id: string
        }
        Returns: string
      }
      create_tenant_addon_quote_snapshot: {
        Args: {
          p_active_locations?: number
          p_country_code?: string
          p_currency?: string
          p_extra_locations?: number
          p_included_locations?: number
          p_mark_accepted?: boolean
          p_monthly_addon_total?: number
          p_pricing_id?: string
          p_snapshot?: Json
          p_tenant_id: string
          p_unit_price_per_extra_location?: number
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          active_locations: number
          addon_key: string | null
          addon_type: string
          billing_interval: string
          country_code: string
          created_at: string
          currency: string
          extra_locations: number
          id: string
          included_locations: number
          monthly_addon_total: number
          pricing_id: string | null
          quantity: number
          snapshot: Json
          status: string
          tenant_id: string
          total_price: number
          unit_price: number
          unit_price_per_extra_location: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_addon_quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_wallet_reversal: {
        Args: {
          p_idempotency_key: string
          p_original_entry_id: string
          p_reason: string
        }
        Returns: string
      }
      credit_customer_purse: {
        Args: {
          p_amount: number
          p_currency: string
          p_customer_id: string
          p_gateway_reference?: string
          p_idempotency_key: string
          p_tenant_id: string
        }
        Returns: string
      }
      credit_salon_purse: {
        Args: {
          p_amount: number
          p_currency: string
          p_entry_type: Database["public"]["Enums"]["wallet_entry_type"]
          p_gateway_reference?: string
          p_idempotency_key: string
          p_reference_id: string
          p_reference_type: string
          p_tenant_id: string
        }
        Returns: string
      }
      debit_customer_purse_for_booking: {
        Args: {
          p_amount: number
          p_appointment_id: string
          p_currency: string
          p_customer_id: string
          p_idempotency_key: string
          p_tenant_id: string
        }
        Returns: string
      }
      debit_salon_purse: {
        Args: {
          p_amount: number
          p_currency: string
          p_entry_type: Database["public"]["Enums"]["wallet_entry_type"]
          p_idempotency_key: string
          p_reference_id: string
          p_reference_type: string
          p_tenant_id: string
        }
        Returns: string
      }
      debit_salon_purse_for_withdrawal: {
        Args: {
          p_amount: number
          p_currency: string
          p_idempotency_key: string
          p_tenant_id: string
          p_withdrawal_id: string
        }
        Returns: string
      }
      deduct_communication_credits: {
        Args: { p_amount: number; p_tenant_id: string }
        Returns: undefined
      }
      ensure_sales_agent_profile: {
        Args: { p_backoffice_user_id?: string }
        Returns: string
      }
      evaluate_tenant_annual_lockin_offer: {
        Args: { p_now_ts?: string; p_tenant_id: string }
        Returns: {
          annual_offer_id: string
          bonus_trial_days: number
          eligible: boolean
          eligible_until: string
          reason: string
        }[]
      }
      expand_chain_entitlement_and_log_billing: {
        Args: {
          p_new_allowed_locations: number
          p_reason: string
          p_source: string
          p_tenant_id: string
        }
        Returns: Json
      }
      finalize_sales_conversion_from_webhook: {
        Args: {
          p_amount: number
          p_currency: string
          p_paid_at?: string
          p_payment_ref: string
          p_status: string
          p_tenant_id: string
        }
        Returns: Json
      }
      generate_invoice_number: { Args: { _tenant_id: string }; Returns: string }
      get_auth_user_by_email: { Args: { lookup_email: string }; Returns: Json }
      get_customer_engagement_summary: {
        Args: { p_customer_id: string; p_tenant_id: string }
        Returns: {
          last_transaction_at: string
          most_ordered_product: string
          most_ordered_service: string
          products_fulfilled: number
          refunds_count: number
          services_cancelled: number
          services_completed: number
          services_rescheduled: number
        }[]
      }
      get_effective_trial_window: {
        Args: { p_tenant_id: string }
        Returns: {
          ends_at: string
          source: string
          starts_at: string
        }[]
      }
      get_feature_master_state: {
        Args: { p_feature_key: string }
        Returns: {
          enabled: boolean
          feature_key: string
        }[]
      }
      get_inactive_customers: {
        Args: {
          p_days_threshold?: number
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_tenant_id: string
          p_to?: string
        }
        Returns: {
          customer_email: string
          customer_id: string
          customer_name: string
          customer_phone: string
          days_since_last_transaction: number
          last_purchased_item: string
          last_transaction_at: string
          most_ordered_product: string
          most_ordered_service: string
          refunds_count: number
        }[]
      }
      get_marketing_feature_toggles: {
        Args: never
        Returns: {
          other_countries_interest_enabled: boolean
          updated_at: string
          waitlist_enabled: boolean
        }[]
      }
      get_public_catalog_payload: {
        Args: {
          p_country_code?: string
          p_location_ids?: string[]
          p_mode?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_sales_promo_email_vars: {
        Args: { p_origin?: string; p_promo_code_id: string }
        Returns: Json
      }
      get_tenant_plan_change_notifications: {
        Args: { p_limit?: number; p_tenant_id: string }
        Returns: {
          batch_id: string
          change_summary_json: Json
          created_at: string
          cta_opened_at: string
          dismissed_at: string
          notification_id: string
          plan_id: string
          reason: string
          rolled_out_at: string
          rollout_at: string
          seen_at: string
        }[]
      }
      get_tenant_runtime_entitlements: {
        Args: { p_tenant_id: string }
        Returns: {
          allowed_locations: number
          allowed_staff: number
          base_staff_limit: number
          ecommerce_theme_expires_at: string
          extra_staff_seats: number
          has_ecommerce_theme: boolean
          plan_slug: string
          tenant_id: string
          used_locations: number
          used_staff: number
        }[]
      }
      get_tenant_sales_promo_summary: {
        Args: { p_surface?: string; p_tenant_id: string }
        Returns: Json
      }
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
      invalidate_sales_promo_code: {
        Args: { p_promo_code_id: string; p_reason?: string }
        Returns: Json
      }
      is_backoffice_user: { Args: { _user_id: string }; Returns: boolean }
      is_bookable_tenant: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_owner: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      list_accessible_routes: {
        Args: {
          p_context_type: string
          p_location_id?: string
          p_tenant_id: string
        }
        Returns: string[]
      }
      list_catalog_item_integrity_issues: {
        Args: {
          p_item_id?: string
          p_item_type?: string
          p_severity?: string
          p_tenant_id: string
        }
        Returns: {
          branch_location_ids: string[]
          branch_location_names: string[]
          detected_at: string
          id: string
          issue_code: string
          issue_message: string
          item_id: string
          item_type: string
          metadata: Json
          severity: string
          tenant_id: string
        }[]
      }
      list_public_booking_eligible_staff: {
        Args: {
          p_location_id: string
          p_service_ids?: string[]
          p_tenant_id: string
        }
        Returns: {
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      list_tenant_staff_members: {
        Args: {
          p_context_type?: string
          p_location_id?: string
          p_tenant_id: string
        }
        Returns: {
          assigned_location_count: number
          assigned_location_ids: string[]
          assigned_location_names: string[]
          avatar_url: string
          email: string
          full_name: string
          is_active: boolean
          is_unassigned: boolean
          joined_at: string
          last_login_at: string
          phone: string
          profile_created_at: string
          profile_id: string
          profile_updated_at: string
          role: Database["public"]["Enums"]["app_role"]
          role_assigned_at: string
          user_id: string
        }[]
      }
      log_audit_event: {
        Args: {
          _action: string
          _after_json?: Json
          _before_json?: Json
          _branch_location_id?: string
          _entity_id: string
          _entity_type: string
          _metadata?: Json
          _tenant_id: string
        }
        Returns: string
      }
      mark_plan_change_notification_seen: {
        Args: { p_action?: string; p_notification_id: string }
        Returns: boolean
      }
      normalize_country_code: { Args: { value: string }; Returns: string }
      normalize_customer_email: { Args: { value: string }; Returns: string }
      normalize_customer_phone: { Args: { value: string }; Returns: string }
      permanently_delete_catalog_bin_item: {
        Args: { p_item_id: string; p_item_type: string; p_tenant_id: string }
        Returns: boolean
      }
      process_due_scheduled_plan_batches: { Args: never; Returns: number }
      purchase_tenant_extra_seats_and_log_billing: {
        Args: {
          p_quantity: number
          p_reason: string
          p_source: string
          p_tenant_id: string
        }
        Returns: Json
      }
      purchase_tenant_theme_addon_and_log_billing: {
        Args: {
          p_reason?: string
          p_source?: string
          p_tenant_id: string
          p_theme_key?: string
        }
        Returns: Json
      }
      resolve_user_contexts: { Args: { p_tenant_id: string }; Returns: Json }
      seed_default_role_permissions: {
        Args: { p_permissions: Json; p_tenant_id: string }
        Returns: number
      }
      set_active_context: {
        Args: {
          p_context_type: string
          p_location_id?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      set_staff_active_status: {
        Args: { p_is_active: boolean; p_tenant_id: string; p_user_id: string }
        Returns: undefined
      }
      set_tenant_chain_entitlement: {
        Args: {
          p_allowed_locations: number
          p_plan_id: string
          p_reason: string
          p_source: string
          p_tenant_id: string
        }
        Returns: Json
      }
      set_tenant_extra_seats: {
        Args: {
          p_reason: string
          p_source: string
          p_target_quantity: number
          p_tenant_id: string
        }
        Returns: Json
      }
      submit_chain_unlock_request: {
        Args: {
          p_plan_id: string
          p_reason?: string
          p_requested_locations: number
          p_tenant_id: string
        }
        Returns: {
          allowed_locations: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          custom_unlock_amount: number | null
          custom_unlock_currency: string | null
          id: string
          plan_id: string
          reason: string | null
          requested_by: string | null
          requested_locations: number
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenant_chain_unlock_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_staff_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["app_role"]
          p_tenant_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      upgrade_tenant_plan_and_log_billing: {
        Args: {
          p_reason: string
          p_seed_allowed_locations?: number
          p_source: string
          p_target_plan: string
          p_tenant_id: string
        }
        Returns: Json
      }
      user_has_module_access: {
        Args: { p_module: string; p_tenant_id: string; p_user_id: string }
        Returns: boolean
      }
      validate_catalog_item_integrity: {
        Args: { p_item_id: string; p_item_type: string; p_tenant_id: string }
        Returns: {
          branch_location_ids: string[]
          detected_at: string
          id: string
          issue_code: string
          issue_message: string
          item_id: string
          item_type: string
          metadata: Json
          resolved_at: string | null
          severity: string
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "catalog_item_integrity_issues"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      validate_sales_promo_code_for_email: {
        Args: { p_code: string }
        Returns: Json
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
      domain_order_status:
        | "pending_payment"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
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
      payment_setup_status:
        | "pending_bank_account"
        | "subaccount_pending"
        | "ready"
        | "failed"
      payment_status:
        | "unpaid"
        | "deposit_paid"
        | "fully_paid"
        | "pay_at_salon"
        | "refunded_partial"
        | "refunded_full"
      payout_destination_type: "bank" | "mobile_money"
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
      wallet_entry_type:
        | "customer_purse_topup"
        | "customer_purse_debit_booking"
        | "customer_purse_debit_invoice"
        | "customer_purse_reversal"
        | "salon_purse_credit_booking"
        | "salon_purse_credit_invoice"
        | "salon_purse_topup"
        | "salon_purse_withdrawal"
        | "salon_purse_reversal"
        | "salon_purse_debit_credit_purchase"
        | "salon_purse_debit_refund"
      wallet_type: "customer" | "salon"
      withdrawal_status: "pending" | "processing" | "completed" | "failed"
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
      domain_order_status: [
        "pending_payment",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
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
      payment_setup_status: [
        "pending_bank_account",
        "subaccount_pending",
        "ready",
        "failed",
      ],
      payment_status: [
        "unpaid",
        "deposit_paid",
        "fully_paid",
        "pay_at_salon",
        "refunded_partial",
        "refunded_full",
      ],
      payout_destination_type: ["bank", "mobile_money"],
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
      wallet_entry_type: [
        "customer_purse_topup",
        "customer_purse_debit_booking",
        "customer_purse_debit_invoice",
        "customer_purse_reversal",
        "salon_purse_credit_booking",
        "salon_purse_credit_invoice",
        "salon_purse_topup",
        "salon_purse_withdrawal",
        "salon_purse_reversal",
        "salon_purse_debit_credit_purchase",
        "salon_purse_debit_refund",
      ],
      wallet_type: ["customer", "salon"],
      withdrawal_status: ["pending", "processing", "completed", "failed"],
    },
  },
} as const
