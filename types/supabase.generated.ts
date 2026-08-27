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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      account_erasure_requests: {
        Row: {
          auth_delete_confirmed_at: string | null
          auth_delete_intent_at: string | null
          auth_delete_intent_token: string | null
          auth_delete_state: string | null
          auth_delete_target_user_id: string | null
          confirmation_channel: string | null
          confirmation_evidence_hash: string | null
          confirmation_received_at: string | null
          confirmation_recorded_by: string | null
          confirmation_requested_at: string | null
          confirmed_at: string | null
          counts: Json
          created_at: string
          data_subject_request_id: string | null
          email_hash: string
          erased_at: string | null
          help_request_id: string | null
          id: string
          metadata: Json
          operation_claim_expires_at: string | null
          operation_claim_session_id: string | null
          operation_claim_token: string | null
          operation_claimed_at: string | null
          operation_claimed_by: string | null
          operation_version: number
          processed_by: string | null
          receipt: Json
          requested_at: string
          retention_until: string
          reversible_applied_at: string | null
          status: string
          target_email_domain: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auth_delete_confirmed_at?: string | null
          auth_delete_intent_at?: string | null
          auth_delete_intent_token?: string | null
          auth_delete_state?: string | null
          auth_delete_target_user_id?: string | null
          confirmation_channel?: string | null
          confirmation_evidence_hash?: string | null
          confirmation_received_at?: string | null
          confirmation_recorded_by?: string | null
          confirmation_requested_at?: string | null
          confirmed_at?: string | null
          counts?: Json
          created_at?: string
          data_subject_request_id?: string | null
          email_hash: string
          erased_at?: string | null
          help_request_id?: string | null
          id?: string
          metadata?: Json
          operation_claim_expires_at?: string | null
          operation_claim_session_id?: string | null
          operation_claim_token?: string | null
          operation_claimed_at?: string | null
          operation_claimed_by?: string | null
          operation_version?: number
          processed_by?: string | null
          receipt?: Json
          requested_at?: string
          retention_until?: string
          reversible_applied_at?: string | null
          status?: string
          target_email_domain?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auth_delete_confirmed_at?: string | null
          auth_delete_intent_at?: string | null
          auth_delete_intent_token?: string | null
          auth_delete_state?: string | null
          auth_delete_target_user_id?: string | null
          confirmation_channel?: string | null
          confirmation_evidence_hash?: string | null
          confirmation_received_at?: string | null
          confirmation_recorded_by?: string | null
          confirmation_requested_at?: string | null
          confirmed_at?: string | null
          counts?: Json
          created_at?: string
          data_subject_request_id?: string | null
          email_hash?: string
          erased_at?: string | null
          help_request_id?: string | null
          id?: string
          metadata?: Json
          operation_claim_expires_at?: string | null
          operation_claim_session_id?: string | null
          operation_claim_token?: string | null
          operation_claimed_at?: string | null
          operation_claimed_by?: string | null
          operation_version?: number
          processed_by?: string | null
          receipt?: Json
          requested_at?: string
          retention_until?: string
          reversible_applied_at?: string | null
          status?: string
          target_email_domain?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_erasure_requests_confirmation_recorded_by_fkey"
            columns: ["confirmation_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_erasure_requests_data_subject_request_id_fkey"
            columns: ["data_subject_request_id"]
            isOneToOne: false
            referencedRelation: "data_subject_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_erasure_requests_help_request_id_fkey"
            columns: ["help_request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_erasure_requests_operation_claimed_by_fkey"
            columns: ["operation_claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_erasure_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_erasure_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaign_audit: {
        Row: {
          action: string
          campaign_id: string | null
          changed_at: string
          changed_by: string | null
          id: number
          snapshot: Json
        }
        Insert: {
          action: string
          campaign_id?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: number
          snapshot?: Json
        }
        Update: {
          action?: string
          campaign_id?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaign_audit_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaign_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          advertiser_name: string
          billing_model: string
          campaign_type: string
          created_at: string
          created_by: string | null
          cta_label: string
          description: string
          ends_at: string | null
          frequency_cap_per_session: number
          id: string
          image_url: string
          module_keys: string[]
          name: string
          notes: string
          placements: string[]
          priority: number
          sponsor_label: string
          starts_at: string | null
          status: string
          tags: string[]
          target_url: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          advertiser_name?: string
          billing_model?: string
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string
          description?: string
          ends_at?: string | null
          frequency_cap_per_session?: number
          id?: string
          image_url?: string
          module_keys?: string[]
          name: string
          notes?: string
          placements?: string[]
          priority?: number
          sponsor_label?: string
          starts_at?: string | null
          status?: string
          tags?: string[]
          target_url: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          advertiser_name?: string
          billing_model?: string
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string
          description?: string
          ends_at?: string | null
          frequency_cap_per_session?: number
          id?: string
          image_url?: string
          module_keys?: string[]
          name?: string
          notes?: string
          placements?: string[]
          priority?: number
          sponsor_label?: string
          starts_at?: string | null
          status?: string
          tags?: string[]
          target_url?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_network_settings: {
        Row: {
          adsense_client_id: string
          adsense_slots: Json
          auto_ads_enabled: boolean
          created_at: string
          id: string
          notes: string
          placement_modes: Json
          provider: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          adsense_client_id?: string
          adsense_slots?: Json
          auto_ads_enabled?: boolean
          created_at?: string
          id?: string
          notes?: string
          placement_modes?: Json
          provider?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          adsense_client_id?: string
          adsense_slots?: Json
          auto_ads_enabled?: boolean
          created_at?: string
          id?: string
          notes?: string
          placement_modes?: Json
          provider?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_network_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cadu_institutional_source_reviews: {
        Row: {
          category: string
          content_kind: string
          content_url: string
          created_at: string
          id: string
          idempotency_key: string
          instagram_handle: string | null
          intent: string
          name: string
          note: string | null
          origin: string
          registry_sha256: string
          requested_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_id: string
          source_revision: string
          source_url: string
          state: string
          tier: number | null
          updated_at: string
        }
        Insert: {
          category: string
          content_kind?: string
          content_url: string
          created_at?: string
          id?: string
          idempotency_key: string
          instagram_handle?: string | null
          intent?: string
          name: string
          note?: string | null
          origin?: string
          registry_sha256: string
          requested_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_id: string
          source_revision: string
          source_url: string
          state?: string
          tier?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          content_kind?: string
          content_url?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          instagram_handle?: string | null
          intent?: string
          name?: string
          note?: string | null
          origin?: string
          registry_sha256?: string
          requested_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string
          source_revision?: string
          source_url?: string
          state?: string
          tier?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadu_institutional_source_reviews_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cadu_institutional_source_reviews_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      caronas_locations: {
        Row: {
          abbreviations: string[] | null
          aliases: string[]
          created_at: string
          icon: string | null
          id: string
          is_campus: boolean | null
          key: string
          label: string
          updated_at: string
          usage_count: number
          zone_key: string
          zone_label: string
        }
        Insert: {
          abbreviations?: string[] | null
          aliases?: string[]
          created_at?: string
          icon?: string | null
          id?: string
          is_campus?: boolean | null
          key: string
          label: string
          updated_at?: string
          usage_count?: number
          zone_key: string
          zone_label: string
        }
        Update: {
          abbreviations?: string[] | null
          aliases?: string[]
          created_at?: string
          icon?: string | null
          id?: string
          is_campus?: boolean | null
          key?: string
          label?: string
          updated_at?: string
          usage_count?: number
          zone_key?: string
          zone_label?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          archived_by_high: boolean
          archived_by_low: boolean
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_message_sender: string | null
          last_message_type: string | null
          participant_high: string | null
          participant_low: string | null
        }
        Insert: {
          archived_by_high?: boolean
          archived_by_low?: boolean
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender?: string | null
          last_message_type?: string | null
          participant_high?: string | null
          participant_low?: string | null
        }
        Update: {
          archived_by_high?: boolean
          archived_by_low?: boolean
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_message_sender?: string | null
          last_message_type?: string | null
          participant_high?: string | null
          participant_low?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_last_message_sender_fkey"
            columns: ["last_message_sender"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_participant_high_fkey"
            columns: ["participant_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_participant_low_fkey"
            columns: ["participant_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          e2e_envelope: Json | null
          edited_at: string | null
          id: string
          media_path: string | null
          message_type: string
          read_at: string | null
          reply_to_id: string | null
          sender_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          e2e_envelope?: Json | null
          edited_at?: string | null
          id?: string
          media_path?: string | null
          message_type: string
          read_at?: string | null
          reply_to_id?: string | null
          sender_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          e2e_envelope?: Json | null
          edited_at?: string | null
          id?: string
          media_path?: string | null
          message_type?: string
          read_at?: string | null
          reply_to_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_state: {
        Row: {
          conversation_id: string
          last_read_at: string
          last_read_msg_id: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          last_read_msg_id?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          last_read_msg_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_state_last_read_msg_id_fkey"
            columns: ["last_read_msg_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_read_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          likes: number
          parent_id: string | null
          post_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          body: string
          created_at?: string
          id?: string
          likes?: number
          parent_id?: string | null
          post_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          likes?: number
          parent_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      data_subject_request_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: number
          public_message: string | null
          request_id: string
          status: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: number
          public_message?: string | null
          request_id: string
          status: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: number
          public_message?: string | null
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "data_subject_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      data_subject_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          export_schema_version: number
          help_request_id: string | null
          id: string
          idempotency_key: string
          protocol: string
          ready_at: string | null
          request_kind: string
          request_source: string
          requested_format: string
          retention_until: string
          scope: Json
          status: string
          subject_hash: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          export_schema_version?: number
          help_request_id?: string | null
          id?: string
          idempotency_key: string
          protocol: string
          ready_at?: string | null
          request_kind: string
          request_source?: string
          requested_format?: string
          retention_until?: string
          scope?: Json
          status?: string
          subject_hash: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string | null
          export_schema_version?: number
          help_request_id?: string | null
          id?: string
          idempotency_key?: string
          protocol?: string
          ready_at?: string | null
          request_kind?: string
          request_source?: string
          requested_format?: string
          retention_until?: string
          scope?: Json
          status?: string
          subject_hash?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_help_request_id_fkey"
            columns: ["help_request_id"]
            isOneToOne: false
            referencedRelation: "help_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      help_requests: {
        Row: {
          admin_decided_at: string | null
          admin_decided_by: string | null
          admin_note: string | null
          admin_status: string
          allow_contact: boolean
          contact_email: string
          created_at: string
          id: string
          message: string
          metadata: Json
          page_path: string | null
          priority: string
          status: string
          subject: string
          subtopic: string | null
          topic: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_note?: string | null
          admin_status?: string
          allow_contact?: boolean
          contact_email: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          page_path?: string | null
          priority?: string
          status?: string
          subject: string
          subtopic?: string | null
          topic: string
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_decided_at?: string | null
          admin_decided_by?: string | null
          admin_note?: string | null
          admin_status?: string
          allow_contact?: boolean
          contact_email?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          page_path?: string | null
          priority?: string
          status?: string
          subject?: string
          subtopic?: string | null
          topic?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "help_requests_admin_decided_by_fkey"
            columns: ["admin_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_banner_audit: {
        Row: {
          action: string
          banner_id: string | null
          changed_at: string
          changed_by: string | null
          id: number
          snapshot: Json | null
        }
        Insert: {
          action: string
          banner_id?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: number
          snapshot?: Json | null
        }
        Update: {
          action?: string
          banner_id?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: number
          snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "hero_banner_audit_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "hero_banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hero_banner_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_banners: {
        Row: {
          button_text: string
          button_url: string
          created_at: string
          created_by: string | null
          gradient_from: string
          gradient_to: string
          icon_class: string
          id: string
          is_active: boolean
          pill_text: string
          sort_order: number
          subtitle: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          button_text?: string
          button_url?: string
          created_at?: string
          created_by?: string | null
          gradient_from?: string
          gradient_to?: string
          icon_class?: string
          id?: string
          is_active?: boolean
          pill_text?: string
          sort_order?: number
          subtitle?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          button_text?: string
          button_url?: string
          created_at?: string
          created_by?: string | null
          gradient_from?: string
          gradient_to?: string
          icon_class?: string
          id?: string
          is_active?: boolean
          pill_text?: string
          sort_order?: number
          subtitle?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hero_banners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hero_banners_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      home_category_affinity: {
        Row: {
          category_key: string
          created_at: string
          id: string
          interactions_count: number
          module_key: string
          owner_key: string
          owner_kind: string
          score: number
          session_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category_key: string
          created_at?: string
          id?: string
          interactions_count?: number
          module_key: string
          owner_key: string
          owner_kind: string
          score?: number
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category_key?: string
          created_at?: string
          id?: string
          interactions_count?: number
          module_key?: string
          owner_key?: string
          owner_kind?: string
          score?: number
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "home_category_affinity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kc_admin_chart_prefs: {
        Row: {
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kc_invited_emails: {
        Row: {
          email: string
          expires_at: string
          invited_at: string
          invited_by: string | null
          note: string | null
          used_at: string | null
        }
        Insert: {
          email: string
          expires_at?: string
          invited_at?: string
          invited_by?: string | null
          note?: string | null
          used_at?: string | null
        }
        Update: {
          email?: string
          expires_at?: string
          invited_at?: string
          invited_by?: string | null
          note?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kc_invited_emails_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kc_trusted_publishers: {
        Row: {
          created_at: string
          created_by: string | null
          label: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          label?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          label?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kc_trusted_publishers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kc_trusted_publishers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kc_unit_meta: {
        Row: {
          note: string | null
          revision: number
          source: string
          tier: number | null
          unit_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          note?: string | null
          revision?: number
          source?: string
          tier?: number | null
          unit_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          note?: string | null
          revision?: number
          source?: string
          tier?: number | null
          unit_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notification_channel_targets: {
        Row: {
          channel: string
          consent_at: string | null
          consent_granted: boolean
          created_at: string
          destination: string
          metadata: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          consent_at?: string | null
          consent_granted?: boolean
          created_at?: string
          destination: string
          metadata?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          consent_at?: string | null
          consent_granted?: boolean
          created_at?: string
          destination?: string
          metadata?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_channel_targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_attempts: {
        Row: {
          attempted_at: string
          channel: string
          error_message: string | null
          id: string
          outbox_id: string
          provider: string | null
          response_body: Json
          response_code: string | null
          status: string
        }
        Insert: {
          attempted_at?: string
          channel: string
          error_message?: string | null
          id?: string
          outbox_id: string
          provider?: string | null
          response_body?: Json
          response_code?: string | null
          status: string
        }
        Update: {
          attempted_at?: string
          channel?: string
          error_message?: string | null
          id?: string
          outbox_id?: string
          provider?: string | null
          response_body?: Json
          response_code?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_attempts_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "notification_delivery_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_outbox: {
        Row: {
          attempts_count: number
          channel: string
          created_at: string
          destination: string | null
          destination_source: string | null
          error_code: string | null
          error_message: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          notification_id: string | null
          payload: Json
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts_count?: number
          channel: string
          created_at?: string
          destination?: string | null
          destination_source?: string | null
          error_code?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          last_attempt_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          notification_id?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts_count?: number
          channel?: string
          created_at?: string
          destination?: string | null
          destination_source?: string | null
          error_code?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          notification_id?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_outbox_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dispatch_runs: {
        Row: {
          batch_limit: number
          channel_filter: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          execution_id: string | null
          id: string
          mode: string
          provider_issues: Json
          provider_ready: Json
          source: string
          status: string
          summary: Json
        }
        Insert: {
          batch_limit?: number
          channel_filter?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          mode: string
          provider_issues?: Json
          provider_ready?: Json
          source?: string
          status?: string
          summary?: Json
        }
        Update: {
          batch_limit?: number
          channel_filter?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          mode?: string
          provider_issues?: Json
          provider_ready?: Json
          source?: string
          status?: string
          summary?: Json
        }
        Relationships: []
      }
      notification_dispatch_runtime: {
        Row: {
          batch_limit: number
          created_at: string
          dispatch_secret: string
          function_url: string | null
          slot: string
          updated_at: string
        }
        Insert: {
          batch_limit?: number
          created_at?: string
          dispatch_secret?: string
          function_url?: string | null
          slot?: string
          updated_at?: string
        }
        Update: {
          batch_limit?: number
          created_at?: string
          dispatch_secret?: string
          function_url?: string | null
          slot?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          read?: boolean
          title?: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_responses: {
        Row: {
          created_at: string
          participant_id: string
          prompt_id: string
          session_code: string
          value: string
        }
        Insert: {
          created_at?: string
          participant_id: string
          prompt_id: string
          session_code: string
          value: string
        }
        Update: {
          created_at?: string
          participant_id?: string
          prompt_id?: string
          session_code?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_responses_session_code_fkey"
            columns: ["session_code"]
            isOneToOne: false
            referencedRelation: "pitch_sessions"
            referencedColumns: ["code"]
          },
        ]
      }
      pitch_sessions: {
        Row: {
          active_prompt: string | null
          code: string
          created_at: string
          current_slide: number
          duration: number
          mode: string
          presenter_token: string
          status: string
          updated_at: string
        }
        Insert: {
          active_prompt?: string | null
          code: string
          created_at?: string
          current_slide?: number
          duration: number
          mode: string
          presenter_token: string
          status?: string
          updated_at?: string
        }
        Update: {
          active_prompt?: string | null
          code?: string
          created_at?: string
          current_slide?: number
          duration?: number
          mode?: string
          presenter_token?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_engagement_rate_windows: {
        Row: {
          event_count: number
          event_type: string
          post_id: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          event_count?: number
          event_type: string
          post_id: string
          updated_at?: string
          window_started_at: string
        }
        Update: {
          event_count?: number
          event_type?: string
          post_id?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_engagement_rate_windows_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_flood_limits: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          max_posts: number
          module: string | null
          updated_at: string
          user_id: string | null
          window_minutes: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_posts?: number
          module?: string | null
          updated_at?: string
          user_id?: string | null
          window_minutes?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_posts?: number
          module?: string | null
          updated_at?: string
          user_id?: string | null
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_flood_limits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_flood_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_flood_resets: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          module: string | null
          reason: string | null
          reset_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          module?: string | null
          reason?: string | null
          reset_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          module?: string | null
          reason?: string | null
          reset_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_flood_resets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_flood_resets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_limits: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          max_active: number
          module: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_active?: number
          module?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_active?: number
          module?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_limits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          created_at: string
          id: string
          is_cover: boolean
          post_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_cover?: boolean
          post_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_cover?: boolean
          post_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_view_events: {
        Row: {
          created_at: string
          id: string
          post_id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_view_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_votes: {
        Row: {
          created_at: string
          direction: string
          id: string
          post_id: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          id?: string
          post_id: string
          voter_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          post_id?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string | null
          bumped_at: string | null
          category: string | null
          coupon_clicks: number
          created_at: string
          description: string | null
          expires_at: string | null
          highlight_score: number
          id: string
          image_url: string | null
          last_comment_at: string | null
          legacy_id: string | null
          location: string | null
          metadata: Json
          moderation_reason: string | null
          module: string | null
          price: number | null
          share_count: number
          status: string
          title: string
          updated_at: string
          view_count: number
          visibility: string
          votos: number
        }
        Insert: {
          author_id?: string | null
          bumped_at?: string | null
          category?: string | null
          coupon_clicks?: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          highlight_score?: number
          id?: string
          image_url?: string | null
          last_comment_at?: string | null
          legacy_id?: string | null
          location?: string | null
          metadata?: Json
          moderation_reason?: string | null
          module?: string | null
          price?: number | null
          share_count?: number
          status?: string
          title: string
          updated_at?: string
          view_count?: number
          visibility?: string
          votos?: number
        }
        Update: {
          author_id?: string | null
          bumped_at?: string | null
          category?: string | null
          coupon_clicks?: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          highlight_score?: number
          id?: string
          image_url?: string | null
          last_comment_at?: string | null
          legacy_id?: string | null
          location?: string | null
          metadata?: Json
          moderation_reason?: string | null
          module?: string | null
          price?: number | null
          share_count?: number
          status?: string
          title?: string
          updated_at?: string
          view_count?: number
          visibility?: string
          votos?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_analytics_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_name: string
          id: string
          metadata: Json
          module_key: string | null
          page_path: string
          session_hash: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name: string
          id?: string
          metadata?: Json
          module_key?: string | null
          page_path?: string
          session_hash: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name?: string
          id?: string
          metadata?: Json
          module_key?: string | null
          page_path?: string
          session_hash?: string
          user_id?: string | null
        }
        Relationships: []
      }
      privacy_consent_events: {
        Row: {
          analytics_enabled: boolean
          consent_version: string
          created_at: string
          id: string
          preferences_enabled: boolean
          session_hash: string
          source: string
          user_id: string | null
        }
        Insert: {
          analytics_enabled?: boolean
          consent_version: string
          created_at?: string
          id?: string
          preferences_enabled?: boolean
          session_hash: string
          source?: string
          user_id?: string | null
        }
        Update: {
          analytics_enabled?: boolean
          consent_version?: string
          created_at?: string
          id?: string
          preferences_enabled?: boolean
          session_hash?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          affiliation: string | null
          avatar_path: string | null
          avatar_url: string | null
          bio: string | null
          contact_cta_enabled: boolean
          contact_primary_method: string | null
          created_at: string
          display_name: string | null
          email: string | null
          full_name: string | null
          gender_identity: string | null
          gender_identity_custom: string | null
          id: string
          is_admin: boolean
          onboarding_completed_at: string | null
          profile_public: boolean
          race_color: string | null
          rating_avg: number | null
          rating_count: number
          social_links: Json
          social_visibility: Json
          updated_at: string
          verified: boolean
        }
        Insert: {
          affiliation?: string | null
          avatar_path?: string | null
          avatar_url?: string | null
          bio?: string | null
          contact_cta_enabled?: boolean
          contact_primary_method?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          gender_identity?: string | null
          gender_identity_custom?: string | null
          id: string
          is_admin?: boolean
          onboarding_completed_at?: string | null
          profile_public?: boolean
          race_color?: string | null
          rating_avg?: number | null
          rating_count?: number
          social_links?: Json
          social_visibility?: Json
          updated_at?: string
          verified?: boolean
        }
        Update: {
          affiliation?: string | null
          avatar_path?: string | null
          avatar_url?: string | null
          bio?: string | null
          contact_cta_enabled?: boolean
          contact_primary_method?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          gender_identity?: string | null
          gender_identity_custom?: string | null
          id?: string
          is_admin?: boolean
          onboarding_completed_at?: string | null
          profile_public?: boolean
          race_color?: string | null
          rating_avg?: number | null
          rating_count?: number
          social_links?: Json
          social_visibility?: Json
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string | null
          entity_id: string | null
          entity_type: string
          id: string
          post_id: string | null
          reason: string
          reporter_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          post_id?: string | null
          reason: string
          reporter_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          post_id?: string | null
          reason?: string
          reporter_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_posts: {
        Row: {
          created_at: string
          id: string
          kind: string
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_preferences: {
        Row: {
          created_at: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      search_queries: {
        Row: {
          created_at: string
          id: string
          session_id: string | null
          term: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          session_id?: string | null
          term: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string | null
          term?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string | null
          blocked_subject_hash: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id?: string | null
          blocked_subject_hash: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string | null
          blocked_subject_hash?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_legal_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          id: string
          metadata: Json
          privacy_version: string
          source: string
          terms_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          id?: string
          metadata?: Json
          privacy_version: string
          source?: string
          terms_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          id?: string
          metadata?: Json
          privacy_version?: string
          source?: string
          terms_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_legal_acceptances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ratings: {
        Row: {
          comment: string | null
          context_post_id: string | null
          created_at: string
          id: string
          rater_user_id: string
          rating: number
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          context_post_id?: string | null
          created_at?: string
          id?: string
          rater_user_id: string
          rating: number
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          context_post_id?: string | null
          created_at?: string
          id?: string
          rater_user_id?: string
          rating?: number
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ratings_context_post_id_fkey"
            columns: ["context_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ratings_rater_user_id_fkey"
            columns: ["rater_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ratings_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_log_insert: {
        Args: {
          p_action: string
          p_actor_id?: string
          p_entity_id: string
          p_entity_type: string
          p_payload?: Json
        }
        Returns: undefined
      }
      increment_comment_likes: { Args: { comment_uuid: string }; Returns: Json }
      kc_accept_account_erasure_completion_delivery: {
        Args: {
          p_delivery_claim_token: string
          p_operation_claim_token: string
          p_workflow_id: string
        }
        Returns: Json
      }
      kc_account_audit_email_inventory: {
        Args: { p_email: string }
        Returns: Json
      }
      kc_account_audit_identifier_inventory: {
        Args: { p_user_id: string }
        Returns: Json
      }
      kc_account_erasure_auth_delete_recovery_status: {
        Args: { p_workflow_id: string }
        Returns: Json
      }
      kc_account_erasure_capabilities: { Args: never; Returns: Json }
      kc_account_erasure_completion_outbox_status: {
        Args: { p_workflow_id: string }
        Returns: Json
      }
      kc_account_erasure_copy_gate_status: {
        Args: { p_workflow_id: string }
        Returns: Json
      }
      kc_account_help_redaction_inventory: {
        Args: { p_help_request_ids: string[]; p_subject_hash: string }
        Returns: Json
      }
      kc_active_session_guard_coverage: { Args: never; Returns: Json }
      kc_admin_ad_campaign_audit: {
        Args: { p_campaign_id: string }
        Returns: {
          action: string
          campaign_id: string
          changed_at: string
          editor_name: string
          id: number
          snapshot: Json
        }[]
      }
      kc_admin_add_invite: {
        Args: { p_email: string; p_note?: string }
        Returns: Json
      }
      kc_admin_ads_overview: { Args: { p_since?: string }; Returns: Json }
      kc_admin_archive_ad_campaign: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      kc_admin_banner_audit: {
        Args: { p_banner_id: string }
        Returns: {
          action: string
          changed_at: string
          editor_name: string
          id: number
          snapshot: Json
        }[]
      }
      kc_admin_claim_external_access_delivery: {
        Args: {
          p_claim_id: string
          p_decision: string
          p_id: string
          p_note: string
        }
        Returns: {
          out_admin_decided_at: string
          out_admin_status: string
          out_contact_email: string
          out_id: string
          out_metadata: Json
          out_requester_name: string
        }[]
      }
      kc_admin_close_reports: { Args: { p_post_id: string }; Returns: Json }
      kc_admin_dashboard_daily_metrics: {
        Args: { p_since?: string }
        Returns: {
          ad_clicks_count: number
          ad_impressions_count: number
          admin_actions_count: number
          comment_likes_count: number
          comments_count: number
          day: string
          post_views_count: number
          posts_count: number
          reports_count: number
          saves_count: number
          searches_count: number
          sessions_count: number
          signups_count: number
          votes_count: number
        }[]
      }
      kc_admin_dashboard_overview: {
        Args: { p_prev_since?: string; p_since?: string; p_until?: string }
        Returns: Json
      }
      kc_admin_decide_external_access: {
        Args: { p_decision: string; p_id: string; p_note?: string }
        Returns: {
          out_admin_decided_at: string
          out_admin_status: string
          out_contact_email: string
          out_id: string
          out_metadata: Json
          out_requester_name: string
        }[]
      }
      kc_admin_delete_banner: { Args: { p_id: string }; Returns: undefined }
      kc_admin_delete_post_flood_limit: {
        Args: { p_limit_id: string }
        Returns: Json
      }
      kc_admin_delete_post_limit: {
        Args: { p_limit_id: string }
        Returns: Json
      }
      kc_admin_get_ad_network_settings: { Args: never; Returns: Json }
      kc_admin_get_chart_prefs: { Args: never; Returns: Json }
      kc_admin_get_invites: {
        Args: never
        Returns: {
          email: string
          expires_at: string
          invited_at: string
          invited_by: string
          is_expired: boolean
          note: string
          used_at: string
        }[]
      }
      kc_admin_get_post_flood_limits: { Args: never; Returns: Json }
      kc_admin_get_post_limits: { Args: never; Returns: Json }
      kc_admin_get_user_active_posts_count: {
        Args: { p_user_id: string }
        Returns: Json
      }
      kc_admin_help_queue_summary: {
        Args: never
        Returns: {
          external_pending_count: number
          in_progress_count: number
          urgent_count: number
          waiting_over_24h_count: number
        }[]
      }
      kc_admin_list_ad_campaigns: {
        Args: never
        Returns: {
          advertiser_name: string
          billing_model: string
          campaign_type: string
          created_at: string
          created_by: string | null
          cta_label: string
          description: string
          ends_at: string | null
          frequency_cap_per_session: number
          id: string
          image_url: string
          module_keys: string[]
          name: string
          notes: string
          placements: string[]
          priority: number
          sponsor_label: string
          starts_at: string | null
          status: string
          tags: string[]
          target_url: string
          title: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ad_campaigns"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      kc_admin_list_audit_logs:
        | {
            Args: {
              p_action?: string
              p_actor_query?: string
              p_entity_type?: string
              p_limit?: number
              p_offset?: number
              p_since?: string
            }
            Returns: {
              action: string
              actor_id: string
              created_at: string
              entity_id: string
              entity_type: string
              id: string
              payload: Json
            }[]
          }
        | {
            Args: {
              p_action: string
              p_actor_query: string
              p_entity_type: string
              p_limit: number
              p_offset: number
              p_since: string
              p_until: string
            }
            Returns: {
              action: string
              actor_id: string
              created_at: string
              entity_id: string
              entity_type: string
              id: string
              payload: Json
            }[]
          }
      kc_admin_list_banners: {
        Args: never
        Returns: {
          button_text: string
          button_url: string
          created_at: string
          created_by: string | null
          gradient_from: string
          gradient_to: string
          icon_class: string
          id: string
          is_active: boolean
          pill_text: string
          sort_order: number
          subtitle: string
          title: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "hero_banners"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      kc_admin_list_external_access: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: {
          out_admin_decided_at: string
          out_admin_note: string
          out_admin_status: string
          out_affiliation_context: string
          out_contact_email: string
          out_created_at: string
          out_id: string
          out_message: string
          out_metadata: Json
          out_requester_name: string
          out_subject: string
          out_total_count: number
        }[]
      }
      kc_admin_list_help_requests_paged: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_type?: string
        }
        Returns: {
          allow_contact: boolean
          author_name: string
          contact_email: string
          created_at: string
          id: string
          message: string
          metadata: Json
          page_path: string
          priority: string
          status: string
          subject: string
          subtopic: string
          topic: string
          total_count: number
          type: string
          updated_at: string
          user_id: string
        }[]
      }
      kc_admin_list_help_requests_v2: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_priority?: string
          p_query?: string
          p_status?: string
          p_type?: string
        }
        Returns: {
          admin_decided_at: string
          admin_decided_by: string
          admin_note: string
          admin_status: string
          allow_contact: boolean
          author_name: string
          contact_email: string
          created_at: string
          external_pending_count: number
          id: string
          in_progress_count: number
          message: string
          metadata: Json
          page_path: string
          priority: string
          status: string
          subject: string
          subtopic: string
          topic: string
          total_count: number
          type: string
          updated_at: string
          urgent_count: number
          user_id: string
          waiting_over_24h_count: number
        }[]
      }
      kc_admin_list_reports: {
        Args: { p_limit?: number; p_reason?: string; p_status?: string }
        Returns: {
          created_at: string
          details: string
          id: string
          post_id: string
          reason: string
          reporter_id: string
          status: string
        }[]
      }
      kc_admin_privacy_analytics: {
        Args: {
          p_event_name?: string
          p_limit?: number
          p_module_key?: string
          p_offset?: number
          p_page_path?: string
          p_since?: string
        }
        Returns: Json
      }
      kc_admin_read_data_export_artifact:
        | {
            Args: {
              p_actor_id: string
              p_artifact_ref: string
              p_help_request_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_artifact_ref: string
              p_help_request_id: string
            }
            Returns: Json
          }
      kc_admin_reorder_banners: { Args: { p_items: Json }; Returns: undefined }
      kc_admin_reset_post_flood_limit: {
        Args: { p_module?: string; p_reason?: string; p_user_id: string }
        Returns: Json
      }
      kc_admin_revoke_invite: { Args: { p_email: string }; Returns: Json }
      kc_admin_save_ad_campaign: {
        Args: { p_data: Json }
        Returns: {
          advertiser_name: string
          billing_model: string
          campaign_type: string
          created_at: string
          created_by: string | null
          cta_label: string
          description: string
          ends_at: string | null
          frequency_cap_per_session: number
          id: string
          image_url: string
          module_keys: string[]
          name: string
          notes: string
          placements: string[]
          priority: number
          sponsor_label: string
          starts_at: string | null
          status: string
          tags: string[]
          target_url: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ad_campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_admin_save_ad_network_settings: {
        Args: { p_data: Json }
        Returns: Json
      }
      kc_admin_save_banner: {
        Args: { p_data: Json }
        Returns: {
          button_text: string
          button_url: string
          created_at: string
          created_by: string | null
          gradient_from: string
          gradient_to: string
          icon_class: string
          id: string
          is_active: boolean
          pill_text: string
          sort_order: number
          subtitle: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "hero_banners"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_admin_save_chart_prefs: { Args: { p_prefs: Json }; Returns: Json }
      kc_admin_search_posts_full: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
        }
        Returns: {
          author_id: string
          author_name: string
          category: string
          content: string
          created_at: string
          id: string
          legacy_id: string
          module: string
          status: string
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      kc_admin_search_profiles_for_limits: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          out_display_name: string
          out_email: string
          out_full_name: string
          out_id: string
        }[]
      }
      kc_admin_search_trends: {
        Args: { p_limit?: number; p_since?: string }
        Returns: {
          count: number
          term: string
        }[]
      }
      kc_admin_search_trends_classified: {
        Args: { p_limit?: number; p_since?: string }
        Returns: {
          count: number
          module: string
          module_confidence: number
          term: string
        }[]
      }
      kc_admin_set_post_flood_limit: {
        Args: {
          p_max_posts?: number
          p_module?: string
          p_user_id?: string
          p_window_minutes?: number
        }
        Returns: Json
      }
      kc_admin_set_post_limit: {
        Args: { p_max_active?: number; p_module?: string; p_user_id?: string }
        Returns: Json
      }
      kc_admin_set_post_status: {
        Args: { p_close_reports?: boolean; p_post_id: string; p_status: string }
        Returns: Json
      }
      kc_admin_triage_help_request: {
        Args: {
          p_expected_updated_at?: string
          p_id: string
          p_priority: string
          p_status: string
        }
        Returns: {
          out_id: string
          out_priority: string
          out_status: string
          out_updated_at: string
        }[]
      }
      kc_authorize_data_export_artifact_upload: {
        Args: {
          p_artifact_ref: string
          p_claim_token: string
          p_expected_version: number
          p_lease_seconds?: number
        }
        Returns: Json
      }
      kc_begin_data_export_retention_run: {
        Args: {
          p_request_nonce?: string
          p_request_signed_at?: string
          p_requested_limit?: number
          p_source?: string
        }
        Returns: Json
      }
      kc_build_notification_delivery_payload: {
        Args: {
          p_body: string
          p_data?: Json
          p_event_type: string
          p_notification_id?: string
          p_title: string
        }
        Returns: Json
      }
      kc_bump_post: { Args: { p_post_id: string }; Returns: Json }
      kc_cadu_metadata_contract: { Args: never; Returns: Json }
      kc_cadu_replace_post_media: {
        Args: { p_image_urls: string[]; p_metadata: Json; p_post_id: string }
        Returns: Json
      }
      kc_cadu_review_contract: { Args: never; Returns: Json }
      kc_cadu_upsert_legacy_override: {
        Args: {
          p_expected_exists: boolean
          p_expected_revision: number
          p_note: string
          p_resolved_source_id: string
          p_tier: number
          p_unit_id: string
        }
        Returns: Json
      }
      kc_cadu_upsert_source_override: {
        Args: {
          p_expected_exists: boolean
          p_expected_meta_revisions: Json
          p_expected_revision: number
          p_note: string
          p_source_id: string
          p_tier: number
        }
        Returns: Json
      }
      kc_can_read_post: {
        Args: { p_author_id: string; p_status: string; p_visibility: string }
        Returns: boolean
      }
      kc_cancel_data_subject_request: {
        Args: { p_protocol: string }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          export_schema_version: number
          help_request_id: string | null
          id: string
          idempotency_key: string
          protocol: string
          ready_at: string | null
          request_kind: string
          request_source: string
          requested_format: string
          retention_until: string
          scope: Json
          status: string
          subject_hash: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "data_subject_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_chat_block_user: {
        Args: { p_other_user_id: string; p_reason?: string }
        Returns: undefined
      }
      kc_chat_delete_message: {
        Args: { p_message_id: string }
        Returns: {
          out_media_path: string
        }[]
      }
      kc_chat_edit_message: {
        Args: { p_message_id: string; p_new_content: string }
        Returns: undefined
      }
      kc_chat_is_blocked: {
        Args: { p_other_user_id: string }
        Returns: {
          out_i_blocked: boolean
          out_they_blocked: boolean
        }[]
      }
      kc_chat_list_conversations: {
        Args: { p_before?: string; p_limit?: number }
        Returns: {
          out_archived: boolean
          out_conversation_id: string
          out_last_message_at: string
          out_last_message_preview: string
          out_last_message_sender: string
          out_last_message_type: string
          out_other_avatar_url: string
          out_other_display_name: string
          out_other_user_id: string
          out_unread_count: number
        }[]
      }
      kc_chat_list_messages: {
        Args: {
          p_before_ts?: string
          p_conversation_id: string
          p_limit?: number
        }
        Returns: {
          out_content: string
          out_created_at: string
          out_deleted_at: string
          out_edited_at: string
          out_media_path: string
          out_message_id: string
          out_message_type: string
          out_reactions: Json
          out_read_at: string
          out_reply_to_id: string
          out_sender_id: string
        }[]
      }
      kc_chat_mark_read: {
        Args: { p_conversation_id: string; p_until_message_id: string }
        Returns: undefined
      }
      kc_chat_report_message: {
        Args: { p_details?: string; p_message_id: string; p_reason: string }
        Returns: undefined
      }
      kc_chat_send_message: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_media_path: string
          p_message_type: string
        }
        Returns: {
          out_created_at: string
          out_message_id: string
        }[]
      }
      kc_chat_set_conversation_archived: {
        Args: { p_archived: boolean; p_conversation_id: string }
        Returns: Json
      }
      kc_chat_set_message_reply: {
        Args: { p_message_id: string; p_reply_to_id: string }
        Returns: Json
      }
      kc_chat_start_conversation: {
        Args: { p_other_user_id: string }
        Returns: {
          out_conversation_id: string
          out_is_new: boolean
        }[]
      }
      kc_chat_toggle_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: Json
      }
      kc_chat_unblock_user: {
        Args: { p_other_user_id: string }
        Returns: undefined
      }
      kc_chat_unread_total: {
        Args: never
        Returns: {
          out_total: number
        }[]
      }
      kc_check_duplicate_post: {
        Args: {
          p_module: string
          p_threshold?: number
          p_title: string
          p_user_id: string
        }
        Returns: Json
      }
      kc_check_post_flood_limit: {
        Args: { p_module?: string; p_user_id: string }
        Returns: Json
      }
      kc_check_post_limit: {
        Args: { p_module?: string; p_user_id: string }
        Returns: Json
      }
      kc_checkpoint_account_erasure_auth_delete_intent: {
        Args: {
          p_actor_id: string
          p_actor_session_id: string
          p_checkpoint: Json
          p_core_inventory: Json
          p_expected_version: number
          p_operation_claim_token: string
          p_target_user_id: string
          p_workflow_id: string
        }
        Returns: {
          auth_delete_confirmed_at: string | null
          auth_delete_intent_at: string | null
          auth_delete_intent_token: string | null
          auth_delete_state: string | null
          auth_delete_target_user_id: string | null
          confirmation_channel: string | null
          confirmation_evidence_hash: string | null
          confirmation_received_at: string | null
          confirmation_recorded_by: string | null
          confirmation_requested_at: string | null
          confirmed_at: string | null
          counts: Json
          created_at: string
          data_subject_request_id: string | null
          email_hash: string
          erased_at: string | null
          help_request_id: string | null
          id: string
          metadata: Json
          operation_claim_expires_at: string | null
          operation_claim_session_id: string | null
          operation_claim_token: string | null
          operation_claimed_at: string | null
          operation_claimed_by: string | null
          operation_version: number
          processed_by: string | null
          receipt: Json
          requested_at: string
          retention_until: string
          reversible_applied_at: string | null
          status: string
          target_email_domain: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "account_erasure_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_claim_account_erasure_completion_outbox: {
        Args: { p_operation_claim_token: string; p_workflow_id: string }
        Returns: Json
      }
      kc_claim_account_erasure_irreversible_operation:
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_expected_status: string
              p_expected_version: number
              p_request_id: string
              p_ttl_seconds?: number
            }
            Returns: {
              out_claim_expires_at: string
              out_claim_token: string
              out_operation_version: number
              out_request_id: string
            }[]
          }
        | {
            Args: {
              p_actor_id: string
              p_expected_status: string
              p_expected_version: number
              p_request_id: string
              p_ttl_seconds?: number
            }
            Returns: {
              out_claim_expires_at: string
              out_claim_token: string
              out_operation_version: number
              out_request_id: string
            }[]
          }
      kc_claim_account_erasure_irreversible_operation_v2: {
        Args: {
          p_actor_id: string
          p_actor_session_id: string
          p_data_subject_request_id: string
          p_expected_data_subject_status: string
          p_expected_status: string
          p_expected_version: number
          p_request_id: string
          p_ttl_seconds?: number
        }
        Returns: {
          out_claim_expires_at: string
          out_claim_token: string
          out_data_subject_request_id: string
          out_data_subject_request_status: string
          out_operation_version: number
          out_request_id: string
        }[]
      }
      kc_claim_account_erasure_operation:
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_expected_status: string
              p_expected_version: number
              p_request_id: string
              p_ttl_seconds?: number
            }
            Returns: {
              out_claim_expires_at: string
              out_claim_token: string
              out_operation_version: number
              out_request_id: string
            }[]
          }
        | {
            Args: {
              p_actor_id: string
              p_expected_status: string
              p_expected_version: number
              p_request_id: string
              p_ttl_seconds?: number
            }
            Returns: {
              out_claim_expires_at: string
              out_claim_token: string
              out_operation_version: number
              out_request_id: string
            }[]
          }
      kc_claim_data_export_artifact:
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_artifact_ref: string
              p_expected_version: number
              p_lease_seconds?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_artifact_ref: string
              p_expected_version: number
              p_lease_seconds?: number
            }
            Returns: Json
          }
      kc_claim_data_export_artifact_purge:
        | {
            Args: {
              p_actor_id?: string
              p_artifact_ref: string
              p_expected_version: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_artifact_ref: string
              p_expected_version: number
            }
            Returns: Json
          }
      kc_claim_data_export_artifacts_for_erasure: {
        Args: {
          p_erasure_request_id: string
          p_limit?: number
          p_user_id: string
        }
        Returns: Json
      }
      kc_claim_expired_data_export_artifacts:
        | { Args: { p_actor_id?: string; p_limit?: number }; Returns: Json }
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_limit: number
            }
            Returns: Json
          }
      kc_claim_help_request_notification: {
        Args: {
          p_caller_id: string
          p_claim_token: string
          p_help_request_id: string
          p_lease_id: string
          p_lease_seconds?: number
        }
        Returns: {
          out_attempt: number
          out_help_request: Json
          out_lease_expires_at: string
          out_state: string
        }[]
      }
      kc_claim_notification_delivery_batch: {
        Args: { p_channel: string; p_limit?: number; p_worker?: string }
        Returns: {
          attempts_count: number
          channel: string
          created_at: string
          destination: string | null
          destination_source: string | null
          error_code: string | null
          error_message: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          notification_id: string | null
          payload: Json
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_delivery_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      kc_close_post: {
        Args: { p_post_id: string; p_reason?: string }
        Returns: Json
      }
      kc_complete_data_export_artifact_erasure_purge: {
        Args: {
          p_artifact_ref: string
          p_erasure_request_id: string
          p_expected_version: number
        }
        Returns: Json
      }
      kc_complete_external_access_delivery: {
        Args: {
          p_claim_id: string
          p_decision: string
          p_delivery: Json
          p_id: string
        }
        Returns: boolean
      }
      kc_complete_help_request_notification: {
        Args: {
          p_help_request_id: string
          p_lease_id: string
          p_result?: Json
          p_succeeded: boolean
        }
        Returns: boolean
      }
      kc_compute_highlight_score: {
        Args: { p_post_id: string }
        Returns: number
      }
      kc_confirm_account_erasure_auth_deleted: {
        Args: {
          p_actor_id: string
          p_actor_session_id: string
          p_expected_version: number
          p_intent_token: string
          p_operation_claim_token: string
          p_workflow_id: string
        }
        Returns: {
          auth_delete_confirmed_at: string | null
          auth_delete_intent_at: string | null
          auth_delete_intent_token: string | null
          auth_delete_state: string | null
          auth_delete_target_user_id: string | null
          confirmation_channel: string | null
          confirmation_evidence_hash: string | null
          confirmation_received_at: string | null
          confirmation_recorded_by: string | null
          confirmation_requested_at: string | null
          confirmed_at: string | null
          counts: Json
          created_at: string
          data_subject_request_id: string | null
          email_hash: string
          erased_at: string | null
          help_request_id: string | null
          id: string
          metadata: Json
          operation_claim_expires_at: string | null
          operation_claim_session_id: string | null
          operation_claim_token: string | null
          operation_claimed_at: string | null
          operation_claimed_by: string | null
          operation_version: number
          processed_by: string | null
          receipt: Json
          requested_at: string
          retention_until: string
          reversible_applied_at: string | null
          status: string
          target_email_domain: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "account_erasure_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_consume_data_export_artifact_download: {
        Args: {
          p_artifact_ref: string
          p_download_token: string
          p_expected_version: number
          p_observed_byte_size: number
          p_observed_sha256: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      kc_count_active_posts: {
        Args: { p_module?: string; p_user_id: string }
        Returns: number
      }
      kc_count_recent_notification_deliveries: {
        Args: { p_channel: string; p_since?: string; p_user_id: string }
        Returns: number
      }
      kc_count_recent_posts: {
        Args: {
          p_module?: string
          p_user_id: string
          p_window_minutes?: number
        }
        Returns: number
      }
      kc_create_data_subject_request: {
        Args: {
          p_idempotency_key: string
          p_request_kind: string
          p_request_source?: string
          p_requested_format?: string
        }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          export_schema_version: number
          help_request_id: string | null
          id: string
          idempotency_key: string
          protocol: string
          ready_at: string | null
          request_kind: string
          request_source: string
          requested_format: string
          retention_until: string
          scope: Json
          status: string
          subject_hash: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "data_subject_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_create_data_subject_request_v2: {
        Args: {
          p_idempotency_key: string
          p_request_kind: string
          p_request_source?: string
          p_requested_format?: string
        }
        Returns: Json
      }
      kc_create_help_request: {
        Args: { p_payload: Json }
        Returns: {
          out_created_at: string
          out_id: string
        }[]
      }
      kc_create_help_request_with_notification_claim: {
        Args: { p_payload: Json }
        Returns: {
          out_created_at: string
          out_id: string
          out_notification_claim: string
          out_notification_claim_expires_at: string
        }[]
      }
      kc_create_help_request_with_notification_claim_v2: {
        Args: { p_payload: Json }
        Returns: {
          out_created_at: string
          out_data_subject_request: Json
          out_id: string
          out_notification_claim: string
          out_notification_claim_expires_at: string
          out_protocol: string
          out_reused_existing: boolean
        }[]
      }
      kc_create_institutional_source_review: {
        Args: {
          p_category: string
          p_content_kind: string
          p_content_url: string
          p_idempotency_key: string
          p_instagram_handle: string
          p_intent: string
          p_name: string
          p_note: string
          p_origin: string
          p_registry_sha256: string
          p_requested_by: string
          p_source_id: string
          p_source_revision: string
          p_source_url: string
          p_tier: number
        }
        Returns: {
          category: string
          content_kind: string
          content_url: string
          created_at: string
          id: string
          idempotency_key: string
          instagram_handle: string
          intent: string
          name: string
          note: string
          origin: string
          registry_sha256: string
          replayed: boolean
          requested_by: string
          source_id: string
          source_revision: string
          source_url: string
          state: string
          tier: number
        }[]
      }
      kc_create_privacy_help_guest_v1: {
        Args: { p_payload: Json }
        Returns: {
          out_created_at: string
          out_data_subject_request: Json
          out_id: string
          out_idempotency_replayed: boolean
          out_notification_claim: string
          out_notification_claim_expires_at: string
          out_protocol: string
          out_reused_existing: boolean
        }[]
      }
      kc_create_privacy_help_request_v1: {
        Args: { p_payload: Json }
        Returns: {
          out_created_at: string
          out_data_subject_request: Json
          out_id: string
          out_idempotency_replayed: boolean
          out_notification_claim: string
          out_notification_claim_expires_at: string
          out_protocol: string
          out_reused_existing: boolean
        }[]
      }
      kc_default_notification_preferences: { Args: never; Returns: Json }
      kc_default_search_preferences: { Args: never; Returns: Json }
      kc_discard_account_erasure_completion_outbox: {
        Args: { p_operation_claim_token: string; p_workflow_id: string }
        Returns: Json
      }
      kc_emit_notification_event: {
        Args: {
          p_body: string
          p_data?: Json
          p_event_type: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      kc_enforce_active_session_pre_request: { Args: never; Returns: undefined }
      kc_enqueue_data_export_artifact: {
        Args: { p_processors?: Json; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      kc_enqueue_notification_delivery: {
        Args: {
          p_body: string
          p_channel: string
          p_data?: Json
          p_event_type: string
          p_notification_id?: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      kc_expire_old_posts: { Args: never; Returns: Json }
      kc_fail_data_export_artifact: {
        Args: {
          p_artifact_ref: string
          p_claim_token: string
          p_error_code: string
          p_expected_version: number
        }
        Returns: Json
      }
      kc_feed_array_contains_all: {
        Args: { p_haystack: string[]; p_needles: string[] }
        Returns: boolean
      }
      kc_feed_caronas_campus_match: {
        Args: { p_campus: string; p_haystack: string }
        Returns: boolean
      }
      kc_feed_category_key: {
        Args: { p_module: string; p_value: string }
        Returns: string
      }
      kc_feed_category_label: {
        Args: { p_category: string; p_module: string }
        Returns: string
      }
      kc_feed_classify_period: { Args: { p_value: string }; Returns: string }
      kc_feed_event_local_date: {
        Args: { p_created_at: string; p_metadata: Json }
        Returns: string
      }
      kc_feed_first_lifecycle_timestamp: {
        Args: { p_boundary?: string; p_values: Json }
        Returns: string
      }
      kc_feed_jsonb_bool: { Args: { p_value: Json }; Returns: boolean }
      kc_feed_jsonb_slug_list: { Args: { p_value: Json }; Returns: string[] }
      kc_feed_jsonb_text_list: { Args: { p_value: Json }; Returns: string[] }
      kc_feed_local_date: { Args: { p_value: string }; Returns: string }
      kc_feed_lost_found_status_key: {
        Args: { p_value: string }
        Returns: string
      }
      kc_feed_lost_found_type_key: {
        Args: { p_value: string }
        Returns: string
      }
      kc_feed_market_category_key: {
        Args: { p_value: string }
        Returns: string
      }
      kc_feed_market_condition_key: {
        Args: { p_value: string }
        Returns: string
      }
      kc_feed_matches_date_preset: {
        Args: {
          p_created_at: string
          p_metadata: Json
          p_module: string
          p_now?: string
          p_preset: string
        }
        Returns: boolean
      }
      kc_feed_normalize_text: { Args: { p_value: string }; Returns: string }
      kc_feed_opportunity_area_key: {
        Args: { p_explicit: string; p_haystack: string; p_subcategory: string }
        Returns: string
      }
      kc_feed_opportunity_employment_key: {
        Args: { p_explicit: string; p_haystack: string }
        Returns: string
      }
      kc_feed_opportunity_type_key: {
        Args: { p_haystack: string; p_value: string }
        Returns: string
      }
      kc_feed_opportunity_work_mode_key: {
        Args: { p_explicit: string; p_haystack: string }
        Returns: string
      }
      kc_feed_parse_lifecycle_timestamp: {
        Args: { p_boundary?: string; p_value: string }
        Returns: string
      }
      kc_feed_parse_numeric_text: { Args: { p_value: string }; Returns: number }
      kc_feed_post_is_closed_or_ended: {
        Args: {
          p_expires_at: string
          p_metadata: Json
          p_module: string
          p_now?: string
          p_status: string
        }
        Returns: boolean
      }
      kc_feed_ride_feature_json: { Args: { p_value: Json }; Returns: Json }
      kc_feed_ride_feature_key: { Args: { p_value: string }; Returns: string }
      kc_feed_slug_key: { Args: { p_value: string }; Returns: string }
      kc_finalize_data_export_artifact: {
        Args: {
          p_artifact_ref: string
          p_byte_size: number
          p_claim_token: string
          p_expected_version: number
          p_manifest: Json
          p_sha256: string
          p_ttl_seconds?: number
        }
        Returns: Json
      }
      kc_finish_data_export_retention_run: {
        Args: {
          p_claimed_count: number
          p_error_code?: string
          p_failed_count: number
          p_failure_codes?: Json
          p_purged_count: number
          p_run_id: string
          p_status: string
        }
        Returns: Json
      }
      kc_get_feed_ad_config: {
        Args: {
          p_module_key?: string
          p_page_path?: string
          p_placement?: string
        }
        Returns: Json
      }
      kc_get_feed_ads: {
        Args: {
          p_limit?: number
          p_module_key?: string
          p_page_path?: string
          p_placement?: string
          p_search_query?: string
        }
        Returns: {
          advertiser_name: string
          campaign_type: string
          cta_label: string
          description: string
          ends_at: string
          frequency_cap_per_session: number
          id: string
          image_url: string
          module_keys: string[]
          name: string
          placements: string[]
          priority: number
          sponsor_label: string
          starts_at: string
          tags: string[]
          target_url: string
          title: string
        }[]
      }
      kc_get_feed_cursor:
        | {
            Args: {
              p_category?: string
              p_cursor?: string
              p_limit?: number
              p_module?: string
              p_modules?: string[]
              p_q?: string
              p_sort_by?: string
              p_subcategory?: string
              p_tag?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_category?: string
              p_cursor?: string
              p_limit?: number
              p_module?: string
              p_modules?: string[]
              p_q?: string
              p_request_params?: Json
              p_sort_by?: string
              p_subcategory?: string
              p_tag?: string
            }
            Returns: Json
          }
      kc_get_my_saved_posts: {
        Args: { p_kind?: string; p_limit?: number; p_page?: number }
        Returns: {
          category: string
          created_at: string
          legacy_id: string
          module: string
          post_uuid: string
          save_kinds: string[]
          saved_at: string
          status: string
          title: string
        }[]
      }
      kc_get_my_saved_posts_count: {
        Args: { p_kind?: string }
        Returns: number
      }
      kc_get_my_votes: {
        Args: { p_post_ids: string[] }
        Returns: {
          direction: string
          post_id: string
        }[]
      }
      kc_get_notifications: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: Json
      }
      kc_get_personalized_tabs: {
        Args: { p_limit?: number; p_session_id?: string }
        Returns: {
          out_category_key: string
          out_module_key: string
          out_score: number
          out_tab_key: string
        }[]
      }
      kc_get_post_analytics: { Args: { p_post_id: string }; Returns: Json }
      kc_get_post_flood_limit: {
        Args: { p_module?: string; p_user_id: string }
        Returns: Json
      }
      kc_get_post_limit: {
        Args: { p_module?: string; p_user_id: string }
        Returns: number
      }
      kc_get_profile_access_state: {
        Args: { p_profile_id: string }
        Returns: {
          exists: boolean
          profile_public: boolean
        }[]
      }
      kc_get_profile_highlights: {
        Args: { p_limit?: number; p_page?: number; p_profile_id: string }
        Returns: {
          category: string
          created_at: string
          legacy_id: string
          module: string
          post_uuid: string
          save_kinds: string[]
          saved_at: string
          status: string
          title: string
        }[]
      }
      kc_get_profile_highlights_count: {
        Args: { p_profile_id: string }
        Returns: number
      }
      kc_get_top_contributors: {
        Args: { p_limit?: number; p_module?: string; p_period?: string }
        Returns: Json
      }
      kc_get_user_rating_state: {
        Args: { p_context_post_id?: string; p_target_user_id: string }
        Returns: Json
      }
      kc_get_user_rating_summary: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      kc_home_category_post_counts: {
        Args: never
        Returns: {
          category_key: string
          count: number
          module_key: string
        }[]
      }
      kc_home_match_category: {
        Args: {
          p_category?: string
          p_description?: string
          p_module_key: string
          p_subcategory?: string
          p_title?: string
        }
        Returns: string
      }
      kc_home_normalize_key: { Args: { p_value: string }; Returns: string }
      kc_increment_location_usage: {
        Args: { p_key: string }
        Returns: undefined
      }
      kc_ingest_search_queries: {
        Args: { p_entries: Json; p_session_id: string }
        Returns: Json
      }
      kc_is_admin: { Args: { p_user_id: string }; Returns: boolean }
      kc_is_current_session_active: { Args: never; Returns: boolean }
      kc_is_institutional_email: { Args: { p_email: string }; Returns: boolean }
      kc_is_invited_email: { Args: { p_email: string }; Returns: boolean }
      kc_is_operator: { Args: { p_user_id: string }; Returns: boolean }
      kc_link_verified_help_request_to_account_erasure: {
        Args: {
          p_account_email: string
          p_actor_id: string
          p_actor_session_id: string
          p_attestation_sha256: string
          p_help_request_id: string
          p_verification_channel: string
          p_verified_at: string
        }
        Returns: Json
      }
      kc_link_verified_help_request_to_data_export:
        | {
            Args: {
              p_account_email: string
              p_actor_id: string
              p_actor_session_id: string
              p_attestation_sha256: string
              p_help_request_id: string
              p_processors?: Json
              p_request_kind: string
              p_verification_channel: string
              p_verified_at: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_account_email: string
              p_actor_id: string
              p_attestation_sha256: string
              p_help_request_id: string
              p_processors?: Json
              p_request_kind: string
              p_verification_channel: string
              p_verified_at: string
            }
            Returns: Json
          }
      kc_list_home_category_affinity: {
        Args: { p_limit?: number; p_offset?: number; p_session_id?: string }
        Returns: {
          category_key: string
          interactions_count: number
          module_key: string
          score: number
          updated_at: string
        }[]
      }
      kc_list_user_ratings: {
        Args: { p_limit?: number; p_page?: number; p_target_user_id: string }
        Returns: Json
      }
      kc_mark_all_notifications_read: { Args: never; Returns: Json }
      kc_mark_invite_used: { Args: never; Returns: undefined }
      kc_mark_notifications_read: { Args: { p_ids: string[] }; Returns: Json }
      kc_matches_feed_request_params: {
        Args: {
          p_category: string
          p_description: string
          p_metadata: Json
          p_module: string
          p_post_subcategory: string
          p_request_params: Json
          p_title: string
          p_verified: boolean
        }
        Returns: boolean
      }
      kc_merge_home_category_affinity: {
        Args: { p_session_id?: string }
        Returns: number
      }
      kc_notification_channel_enabled: {
        Args: { p_channel?: string; p_event: string; p_user_id: string }
        Returns: boolean
      }
      kc_notify_on_post_expire: {
        Args: {
          p_author_id: string
          p_module: string
          p_post_id: string
          p_title: string
        }
        Returns: undefined
      }
      kc_posts_feed_metadata_search_text: {
        Args: { p_metadata: Json }
        Returns: string
      }
      kc_posts_feed_normalize_search_text: {
        Args: { p_value: string }
        Returns: string
      }
      kc_posts_feed_search_text: {
        Args: {
          p_category: string
          p_description: string
          p_location: string
          p_metadata: Json
          p_title: string
        }
        Returns: string
      }
      kc_posts_feed_search_value: { Args: { p_value: Json }; Returns: string }
      kc_posts_search_document: {
        Args: {
          p_category: string
          p_description: string
          p_metadata: Json
          p_title: string
        }
        Returns: unknown
      }
      kc_posts_search_subcategory: {
        Args: { p_metadata: Json }
        Returns: string
      }
      kc_posts_search_tags_text: { Args: { p_metadata: Json }; Returns: string }
      kc_profile_initial_avatar_url: {
        Args: { p_email: string; p_metadata: Json; p_user_id: string }
        Returns: string
      }
      kc_profile_initial_display_name: {
        Args: { p_email: string; p_metadata: Json }
        Returns: string
      }
      kc_prune_old_analytics: { Args: never; Returns: Json }
      kc_prune_old_notifications: { Args: never; Returns: Json }
      kc_purge_data_export_artifact:
        | {
            Args: {
              p_actor_id?: string
              p_artifact_ref: string
              p_expected_version: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_artifact_ref: string
              p_expected_version: number
            }
            Returns: Json
          }
      kc_purge_expired_account_erasure_completion_outbox: {
        Args: { p_limit?: number }
        Returns: Json
      }
      kc_purge_expired_data_subject_requests: {
        Args: { p_limit?: number }
        Returns: Json
      }
      kc_purge_help_request_notification_claims: {
        Args: { p_limit?: number }
        Returns: number
      }
      kc_reactivate_post: { Args: { p_post_id: string }; Returns: Json }
      kc_read_data_export_artifact_for_owner: {
        Args: { p_request_id: string; p_user_id: string }
        Returns: Json
      }
      kc_read_data_export_media_refs_for_download: {
        Args: {
          p_artifact_ref: string
          p_download_token: string
          p_expected_version: number
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      kc_record_account_erasure_copy_decision:
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_attested: boolean
              p_decided_at: string
              p_decision: string
              p_reference_hash: string
              p_workflow_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_attested: boolean
              p_decided_at: string
              p_decision: string
              p_reference_hash: string
              p_workflow_id: string
            }
            Returns: Json
          }
      kc_record_data_export_processor_evidence:
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_artifact_ref: string
              p_evidence_reference: string
              p_expected_version: number
              p_outcome: string
              p_processor: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_artifact_ref: string
              p_delivered_out_of_band_at: string
              p_delivery_attested: boolean
              p_delivery_channel: string
              p_evidence_reference: string
              p_expected_version: number
              p_outcome: string
              p_processor: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_artifact_ref: string
              p_evidence_reference: string
              p_expected_version: number
              p_outcome: string
              p_processor: string
            }
            Returns: Json
          }
      kc_record_notification_delivery_attempt: {
        Args: {
          p_error_code?: string
          p_error_message?: string
          p_next_attempt_at?: string
          p_outbox_id: string
          p_provider?: string
          p_response_body?: Json
          p_response_code?: string
          p_status: string
        }
        Returns: {
          attempts_count: number
          channel: string
          created_at: string
          destination: string | null
          destination_source: string | null
          error_code: string | null
          error_message: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          notification_id: string | null
          payload: Json
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_delivery_outbox"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_record_post_audit_event: {
        Args: { p_action: string; p_payload?: Json; p_post_id: string }
        Returns: Json
      }
      kc_record_privacy_consent: {
        Args: {
          p_analytics: boolean
          p_consent_version: string
          p_preferences: boolean
          p_session_id: string
          p_source?: string
        }
        Returns: Json
      }
      kc_recover_expired_data_export_artifact:
        | {
            Args: {
              p_actor_id: string
              p_actor_session_id: string
              p_artifact_ref: string
              p_expected_version: number
              p_ttl_seconds?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_artifact_ref: string
              p_expected_version: number
              p_ttl_seconds?: number
            }
            Returns: Json
          }
      kc_recover_privacy_help_request_v1: {
        Args: { p_payload: Json }
        Returns: {
          out_created_at: string
          out_data_subject_request: Json
          out_id: string
          out_idempotency_replayed: boolean
          out_notification_claim: string
          out_notification_claim_expires_at: string
          out_protocol: string
          out_recovery_state: string
          out_reused_existing: boolean
        }[]
      }
      kc_redact_account_audit_emails: {
        Args: { p_email: string; p_subject_hash: string }
        Returns: Json
      }
      kc_redact_account_audit_identifiers: {
        Args: { p_user_id: string }
        Returns: Json
      }
      kc_redact_account_help_requests: {
        Args: {
          p_help_request_ids: string[]
          p_receipt: Json
          p_subject_hash: string
        }
        Returns: Json
      }
      kc_refresh_highlight_scores: { Args: never; Returns: Json }
      kc_related_posts: {
        Args: { p_limit?: number; p_post_id: string }
        Returns: {
          candidate_id: string
          reason: string
          relevance_score: number
        }[]
      }
      kc_release_account_erasure_completion_delivery: {
        Args: {
          p_delivery_claim_token: string
          p_operation_claim_token: string
          p_workflow_id: string
        }
        Returns: Json
      }
      kc_release_data_export_artifact_erasure_purge: {
        Args: {
          p_artifact_ref: string
          p_erasure_request_id: string
          p_error_code: string
          p_expected_version: number
        }
        Returns: Json
      }
      kc_renew_account_erasure_operation: {
        Args: {
          p_actor_id: string
          p_actor_session_id: string
          p_expected_version: number
          p_operation_claim_token: string
          p_request_id: string
          p_ttl_seconds?: number
        }
        Returns: {
          out_claim_expires_at: string
          out_claim_token: string
          out_operation_version: number
          out_request_id: string
        }[]
      }
      kc_renew_post: { Args: { p_post_id: string }; Returns: Json }
      kc_report_post: {
        Args: { p_details?: string; p_post_id: string; p_reason: string }
        Returns: Json
      }
      kc_request_email: { Args: never; Returns: string }
      kc_request_uid: { Args: never; Returns: string }
      kc_reserve_data_export_artifact_download: {
        Args: {
          p_artifact_ref: string
          p_expected_version: number
          p_session_id: string
          p_ttl_seconds?: number
          p_user_id: string
        }
        Returns: Json
      }
      kc_reserve_data_subject_download: {
        Args: {
          p_limit?: number
          p_request_id: string
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      kc_resolve_institutional_source_review: {
        Args: {
          p_decision: string
          p_expected_meta_revisions: Json
          p_expected_source_revision: string
          p_resolution_note: string
          p_resolved_by: string
          p_review_id: string
        }
        Returns: {
          id: string
          replayed: boolean
          resolved_at: string
          resolved_by: string
          source_id: string
          source_revision: string
          state: string
        }[]
      }
      kc_resolve_notification_delivery_destination: {
        Args: { p_channel: string; p_user_id: string }
        Returns: Json
      }
      kc_revoke_user_sessions_for_erasure: {
        Args: { p_user_id: string }
        Returns: Json
      }
      kc_search_posts_fts: {
        Args: {
          p_category?: string
          p_hide_closed?: boolean
          p_limit?: number
          p_module?: string
          p_q?: string
          p_subcategory?: string
          p_terms?: string[]
        }
        Returns: Json[]
      }
      kc_stage_account_erasure_completion_outbox: {
        Args: {
          p_data_subject_request_id: string
          p_key_version: string
          p_operation_claim_token: string
          p_recipient_ciphertext: string
          p_recipient_nonce: string
          p_ttl_seconds?: number
          p_workflow_id: string
        }
        Returns: Json
      }
      kc_store_data_export_media_refs: {
        Args: {
          p_artifact_ref: string
          p_claim_token: string
          p_expected_version: number
          p_media_refs: Json
        }
        Returns: Json
      }
      kc_sync_profile_rating_aggregates: {
        Args: { p_target_user_id: string }
        Returns: undefined
      }
      kc_toggle_demo_posts: { Args: { enable: boolean }; Returns: Json }
      kc_toggle_post_status: { Args: { p_post_id: string }; Returns: Json }
      kc_track_coupon_click: { Args: { p_post_id: string }; Returns: Json }
      kc_track_home_category_affinity: {
        Args: { p_events?: Json; p_session_id?: string }
        Returns: number
      }
      kc_track_privacy_event: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_event_name: string
          p_metadata?: Json
          p_module_key?: string
          p_page_path?: string
          p_session_id: string
        }
        Returns: Json
      }
      kc_track_share: { Args: { p_post_id: string }; Returns: Json }
      kc_track_view: { Args: { p_post_id: string }; Returns: Json }
      kc_transition_data_subject_request: {
        Args: {
          p_actor_id: string
          p_event_type: string
          p_expected_status: string
          p_new_status: string
          p_public_message: string
          p_request_id: string
        }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          export_schema_version: number
          help_request_id: string | null
          id: string
          idempotency_key: string
          protocol: string
          ready_at: string | null
          request_kind: string
          request_source: string
          requested_format: string
          retention_until: string
          scope: Json
          status: string
          subject_hash: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "data_subject_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_transition_data_subject_request_for_active_session: {
        Args: {
          p_event_type: string
          p_expected_status: string
          p_new_status: string
          p_public_message: string
          p_request_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          export_schema_version: number
          help_request_id: string | null
          id: string
          idempotency_key: string
          protocol: string
          ready_at: string | null
          request_kind: string
          request_source: string
          requested_format: string
          retention_until: string
          scope: Json
          status: string
          subject_hash: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "data_subject_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_transition_data_subject_request_for_admin_session: {
        Args: {
          p_actor_id: string
          p_actor_session_id: string
          p_event_type: string
          p_expected_status: string
          p_new_status: string
          p_public_message: string
          p_request_id: string
        }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          expires_at: string | null
          export_schema_version: number
          help_request_id: string | null
          id: string
          idempotency_key: string
          protocol: string
          ready_at: string | null
          request_kind: string
          request_source: string
          requested_format: string
          retention_until: string
          scope: Json
          status: string
          subject_hash: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "data_subject_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_trigger_notification_dispatch: {
        Args: {
          p_channel?: string
          p_dry_run?: boolean
          p_limit?: number
          p_source?: string
        }
        Returns: number
      }
      kc_unaccent: { Args: { input_text: string }; Returns: string }
      kc_unread_notification_count: { Args: never; Returns: number }
      kc_upsert_account_erasure_workflow: {
        Args: {
          p_actor_id: string
          p_actor_session_id: string
          p_counts?: Json
          p_data_subject_request_id: string
          p_email_hash: string
          p_help_request_id: string
          p_metadata?: Json
          p_target_email_domain: string
          p_user_id: string
        }
        Returns: {
          auth_delete_confirmed_at: string | null
          auth_delete_intent_at: string | null
          auth_delete_intent_token: string | null
          auth_delete_state: string | null
          auth_delete_target_user_id: string | null
          confirmation_channel: string | null
          confirmation_evidence_hash: string | null
          confirmation_received_at: string | null
          confirmation_recorded_by: string | null
          confirmation_requested_at: string | null
          confirmed_at: string | null
          counts: Json
          created_at: string
          data_subject_request_id: string | null
          email_hash: string
          erased_at: string | null
          help_request_id: string | null
          id: string
          metadata: Json
          operation_claim_expires_at: string | null
          operation_claim_session_id: string | null
          operation_claim_token: string | null
          operation_claimed_at: string | null
          operation_claimed_by: string | null
          operation_version: number
          processed_by: string | null
          receipt: Json
          requested_at: string
          retention_until: string
          reversible_applied_at: string | null
          status: string
          target_email_domain: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "account_erasure_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kc_upsert_custom_location: {
        Args: { p_key: string; p_label: string }
        Returns: undefined
      }
      kc_upsert_user_rating: {
        Args: {
          p_comment?: string
          p_context_post_id?: string
          p_rating?: number
          p_target_user_id: string
        }
        Returns: Json
      }
      notify_admin_if_reports_threshold: {
        Args: { p_post_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
