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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          campus_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          campus_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          campus_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_locations: {
        Row: {
          announcement_id: string
          building_id: string | null
          created_at: string
          effect_type: string
          floor_id: string | null
          id: string
          map_element_id: string | null
          navigation_edge_id: string | null
        }
        Insert: {
          announcement_id: string
          building_id?: string | null
          created_at?: string
          effect_type: string
          floor_id?: string | null
          id?: string
          map_element_id?: string | null
          navigation_edge_id?: string | null
        }
        Update: {
          announcement_id?: string
          building_id?: string | null
          created_at?: string
          effect_type?: string
          floor_id?: string | null
          id?: string
          map_element_id?: string | null
          navigation_edge_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_locations_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_locations_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_locations_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_locations_map_element_id_fkey"
            columns: ["map_element_id"]
            isOneToOne: false
            referencedRelation: "map_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_locations_navigation_edge_id_fkey"
            columns: ["navigation_edge_id"]
            isOneToOne: false
            referencedRelation: "navigation_edges"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          archived_at: string | null
          campus_id: string
          category: string
          content: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          priority: string
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          campus_id: string
          category: string
          content: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          priority?: string
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          campus_id?: string
          category?: string
          content?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          priority?: string
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          archived_at: string | null
          campus_id: string
          category: string
          code: string
          contact_information: string | null
          created_at: string
          created_by: string | null
          description: string | null
          height: number
          id: string
          image_path: string | null
          is_accessible: boolean
          is_searchable: boolean
          is_visible: boolean
          metadata: Json
          name: string
          operating_hours: string | null
          rotation: number
          updated_at: string
          updated_by: string | null
          width: number
          x: number
          y: number
        }
        Insert: {
          archived_at?: string | null
          campus_id: string
          category: string
          code: string
          contact_information?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          height: number
          id?: string
          image_path?: string | null
          is_accessible?: boolean
          is_searchable?: boolean
          is_visible?: boolean
          metadata?: Json
          name: string
          operating_hours?: string | null
          rotation?: number
          updated_at?: string
          updated_by?: string | null
          width: number
          x?: number
          y?: number
        }
        Update: {
          archived_at?: string | null
          campus_id?: string
          category?: string
          code?: string
          contact_information?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          height?: number
          id?: string
          image_path?: string | null
          is_accessible?: boolean
          is_searchable?: boolean
          is_visible?: boolean
          metadata?: Json
          name?: string
          operating_hours?: string | null
          rotation?: number
          updated_at?: string
          updated_by?: string | null
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "buildings_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_versions: {
        Row: {
          campus_id: string
          change_summary: string | null
          created_at: string
          created_by: string
          id: string
          published_at: string | null
          published_by: string | null
          snapshot: Json
          state: string
          updated_at: string
          validation_score: number | null
          version_number: number
        }
        Insert: {
          campus_id: string
          change_summary?: string | null
          created_at?: string
          created_by: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          snapshot: Json
          state: string
          updated_at?: string
          validation_score?: number | null
          version_number: number
        }
        Update: {
          campus_id?: string
          change_summary?: string | null
          created_at?: string
          created_by?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          snapshot?: Json
          state?: string
          updated_at?: string
          validation_score?: number | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "campus_versions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          archived_at: string | null
          canvas_configured: boolean
          canvas_height: number
          canvas_width: number
          city: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          latest_published_version_id: string | null
          latitude: number | null
          logo_path: string | null
          longitude: number | null
          map_scale_m_per_unit: number
          name: string
          overview_image_path: string | null
          postal_code: string | null
          province: string | null
          status: string
          theme_color: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          canvas_configured?: boolean
          canvas_height?: number
          canvas_width?: number
          city?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          latest_published_version_id?: string | null
          latitude?: number | null
          logo_path?: string | null
          longitude?: number | null
          map_scale_m_per_unit?: number
          name: string
          overview_image_path?: string | null
          postal_code?: string | null
          province?: string | null
          status?: string
          theme_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          canvas_configured?: boolean
          canvas_height?: number
          canvas_width?: number
          city?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          latest_published_version_id?: string | null
          latitude?: number | null
          logo_path?: string | null
          longitude?: number | null
          map_scale_m_per_unit?: number
          name?: string
          overview_image_path?: string | null
          postal_code?: string | null
          province?: string | null
          status?: string
          theme_color?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campuses_latest_published_version_fk"
            columns: ["latest_published_version_id"]
            isOneToOne: false
            referencedRelation: "campus_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_locations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          label: string
          map_element_id: string | null
          metadata: Json | null
          updated_at: string
          x: number | null
          y: number | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          label: string
          map_element_id?: string | null
          metadata?: Json | null
          updated_at?: string
          x?: number | null
          y?: number | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          label?: string
          map_element_id?: string | null
          metadata?: Json | null
          updated_at?: string
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_locations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_locations_map_element_id_fkey"
            columns: ["map_element_id"]
            isOneToOne: false
            referencedRelation: "map_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      event_stalls: {
        Row: {
          created_at: string
          description: string | null
          event_id: string
          event_location_id: string | null
          height: number
          id: string
          metadata: Json
          name: string
          updated_at: string
          width: number
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id: string
          event_location_id?: string | null
          height?: number
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
          width?: number
          x: number
          y: number
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string
          event_location_id?: string | null
          height?: number
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_stalls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_stalls_event_location_id_fkey"
            columns: ["event_location_id"]
            isOneToOne: false
            referencedRelation: "event_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          archived_at: string | null
          campus_id: string
          category: string
          cover_image_path: string | null
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          id: string
          organizer: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          campus_id: string
          category: string
          cover_image_path?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          id?: string
          organizer?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          campus_id?: string
          category?: string
          cover_image_path?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          id?: string
          organizer?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          building_id: string | null
          campus_id: string
          created_at: string
          id: string
          map_element_id: string | null
          user_id: string
        }
        Insert: {
          building_id?: string | null
          campus_id: string
          created_at?: string
          id?: string
          map_element_id?: string | null
          user_id: string
        }
        Update: {
          building_id?: string | null
          campus_id?: string
          created_at?: string
          id?: string
          map_element_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_map_element_id_fkey"
            columns: ["map_element_id"]
            isOneToOne: false
            referencedRelation: "map_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          archived_at: string | null
          building_id: string
          canvas_height: number
          canvas_width: number
          created_at: string
          display_order: number
          floor_number: number
          floor_plan_path: string | null
          id: string
          is_visible: boolean
          map_scale_m_per_unit: number | null
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          building_id: string
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          display_order?: number
          floor_number: number
          floor_plan_path?: string | null
          id?: string
          is_visible?: boolean
          map_scale_m_per_unit?: number | null
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          building_id?: string
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          display_order?: number
          floor_number?: number
          floor_plan_path?: string | null
          id?: string
          is_visible?: boolean
          map_scale_m_per_unit?: number | null
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      map_elements: {
        Row: {
          archived_at: string | null
          building_id: string | null
          campus_id: string
          code: string | null
          created_at: string
          description: string | null
          element_type: string
          floor_id: string | null
          geometry: Json | null
          height: number | null
          id: string
          is_accessible: boolean
          is_emergency_asset: boolean
          is_searchable: boolean
          is_visible: boolean
          metadata: Json | null
          name: string
          parent_element_id: string | null
          rotation: number
          search_keywords: string[]
          style: Json
          updated_at: string
          width: number | null
          x: number
          y: number
          z_index: number
        }
        Insert: {
          archived_at?: string | null
          building_id?: string | null
          campus_id: string
          code?: string | null
          created_at?: string
          description?: string | null
          element_type: string
          floor_id?: string | null
          geometry?: Json | null
          height?: number | null
          id?: string
          is_accessible?: boolean
          is_emergency_asset?: boolean
          is_searchable?: boolean
          is_visible?: boolean
          metadata?: Json | null
          name: string
          parent_element_id?: string | null
          rotation?: number
          search_keywords?: string[]
          style?: Json
          updated_at?: string
          width?: number | null
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          archived_at?: string | null
          building_id?: string | null
          campus_id?: string
          code?: string | null
          created_at?: string
          description?: string | null
          element_type?: string
          floor_id?: string | null
          geometry?: Json | null
          height?: number | null
          id?: string
          is_accessible?: boolean
          is_emergency_asset?: boolean
          is_searchable?: boolean
          is_visible?: boolean
          metadata?: Json | null
          name?: string
          parent_element_id?: string | null
          rotation?: number
          search_keywords?: string[]
          style?: Json
          updated_at?: string
          width?: number | null
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_elements_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_elements_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_elements_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_elements_parent_element_id_fkey"
            columns: ["parent_element_id"]
            isOneToOne: false
            referencedRelation: "map_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_edges: {
        Row: {
          campus_id: string
          closure_reason: string | null
          created_at: string
          distance_m: number
          edge_type: string
          from_node_id: string
          id: string
          is_accessible: boolean
          is_bidirectional: boolean
          is_emergency_safe: boolean
          is_temporarily_closed: boolean
          metadata: Json | null
          to_node_id: string
          travel_time_seconds: number | null
          updated_at: string
          weight: number
        }
        Insert: {
          campus_id: string
          closure_reason?: string | null
          created_at?: string
          distance_m: number
          edge_type: string
          from_node_id: string
          id?: string
          is_accessible?: boolean
          is_bidirectional?: boolean
          is_emergency_safe?: boolean
          is_temporarily_closed?: boolean
          metadata?: Json | null
          to_node_id: string
          travel_time_seconds?: number | null
          updated_at?: string
          weight?: number
        }
        Update: {
          campus_id?: string
          closure_reason?: string | null
          created_at?: string
          distance_m?: number
          edge_type?: string
          from_node_id?: string
          id?: string
          is_accessible?: boolean
          is_bidirectional?: boolean
          is_emergency_safe?: boolean
          is_temporarily_closed?: boolean
          metadata?: Json | null
          to_node_id?: string
          travel_time_seconds?: number | null
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "navigation_edges_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "navigation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "navigation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_nodes: {
        Row: {
          building_id: string | null
          campus_id: string
          created_at: string
          floor_id: string | null
          id: string
          is_accessible: boolean
          is_active: boolean
          is_emergency_safe: boolean
          map_element_id: string | null
          metadata: Json | null
          name: string | null
          node_type: string
          updated_at: string
          x: number
          y: number
        }
        Insert: {
          building_id?: string | null
          campus_id: string
          created_at?: string
          floor_id?: string | null
          id?: string
          is_accessible?: boolean
          is_active?: boolean
          is_emergency_safe?: boolean
          map_element_id?: string | null
          metadata?: Json | null
          name?: string | null
          node_type: string
          updated_at?: string
          x?: number
          y?: number
        }
        Update: {
          building_id?: string | null
          campus_id?: string
          created_at?: string
          floor_id?: string | null
          id?: string
          is_accessible?: boolean
          is_active?: boolean
          is_emergency_safe?: boolean
          map_element_id?: string | null
          metadata?: Json | null
          name?: string | null
          node_type?: string
          updated_at?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "navigation_nodes_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_nodes_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_nodes_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "navigation_nodes_map_element_id_fkey"
            columns: ["map_element_id"]
            isOneToOne: false
            referencedRelation: "map_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          department: string | null
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          last_name: string
          role: string
          student_number: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          department?: string | null
          email: string
          first_name?: string
          id: string
          is_active?: boolean
          last_login_at?: string | null
          last_name?: string
          role?: string
          student_number?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          department?: string | null
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          last_name?: string
          role?: string
          student_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recent_destinations: {
        Row: {
          building_id: string | null
          campus_id: string
          code: string | null
          created_at: string
          id: string
          last_visited_at: string
          map_element_id: string | null
          name: string
          user_id: string
          visit_count: number
        }
        Insert: {
          building_id?: string | null
          campus_id: string
          code?: string | null
          created_at?: string
          id?: string
          last_visited_at?: string
          map_element_id?: string | null
          name: string
          user_id: string
          visit_count?: number
        }
        Update: {
          building_id?: string | null
          campus_id?: string
          code?: string | null
          created_at?: string
          id?: string
          last_visited_at?: string
          map_element_id?: string | null
          name?: string
          user_id?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "recent_destinations_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recent_destinations_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recent_destinations_map_element_id_fkey"
            columns: ["map_element_id"]
            isOneToOne: false
            referencedRelation: "map_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recent_destinations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_history: {
        Row: {
          action: string
          created_at: string
          id: string
          new_status: string | null
          note: string | null
          old_status: string | null
          performed_by: string
          report_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_status?: string | null
          note?: string | null
          old_status?: string | null
          performed_by: string
          report_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_status?: string | null
          note?: string | null
          old_status?: string | null
          performed_by?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_history_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_history_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_images: {
        Row: {
          created_at: string
          id: string
          report_id: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          report_id: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          id?: string
          report_id?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_images_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          archived_at: string | null
          assigned_admin_id: string | null
          building_id: string | null
          campus_id: string
          category: string
          created_at: string
          description: string
          floor_id: string | null
          id: string
          internal_notes: string | null
          map_element_id: string | null
          priority: string
          reporter_id: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_admin_id?: string | null
          building_id?: string | null
          campus_id: string
          category: string
          created_at?: string
          description: string
          floor_id?: string | null
          id?: string
          internal_notes?: string | null
          map_element_id?: string | null
          priority?: string
          reporter_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_admin_id?: string | null
          building_id?: string | null
          campus_id?: string
          category?: string
          created_at?: string
          description?: string
          floor_id?: string | null
          id?: string
          internal_notes?: string | null
          map_element_id?: string | null
          priority?: string
          reporter_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_map_element_id_fkey"
            columns: ["map_element_id"]
            isOneToOne: false
            referencedRelation: "map_elements"
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
      system_settings: {
        Row: {
          campus_id: string | null
          created_at: string
          id: string
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_issues: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          rule_code: string
          severity: string
          suggested_resolution: string | null
          validation_run_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          rule_code: string
          severity: string
          suggested_resolution?: string | null
          validation_run_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          rule_code?: string
          severity?: string
          suggested_resolution?: string | null
          validation_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_issues_validation_run_id_fkey"
            columns: ["validation_run_id"]
            isOneToOne: false
            referencedRelation: "validation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_runs: {
        Row: {
          campus_id: string
          campus_version_id: string | null
          created_at: string
          errors_count: number
          id: string
          passed_count: number
          run_by: string
          score: number
          status: string
          warnings_count: number
        }
        Insert: {
          campus_id: string
          campus_version_id?: string | null
          created_at?: string
          errors_count?: number
          id?: string
          passed_count?: number
          run_by: string
          score: number
          status: string
          warnings_count?: number
        }
        Update: {
          campus_id?: string
          campus_version_id?: string | null
          created_at?: string
          errors_count?: number
          id?: string
          passed_count?: number
          run_by?: string
          score?: number
          status?: string
          warnings_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "validation_runs_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_runs_campus_version_id_fkey"
            columns: ["campus_version_id"]
            isOneToOne: false
            referencedRelation: "campus_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_runs_run_by_fkey"
            columns: ["run_by"]
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
      admin_update_profile: {
        Args: {
          p_department: string
          p_first_name: string
          p_is_active: boolean
          p_last_name: string
          p_role: string
          p_student_number: string
          p_target_id: string
        }
        Returns: {
          avatar_path: string | null
          created_at: string
          department: string | null
          email: string
          first_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          last_name: string
          role: string
          student_number: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_campus_map: {
        Args: { p_campus_id: string; p_expected_updated_at: string }
        Returns: string
      }
      campus_is_published: { Args: { p_campus_id: string }; Returns: boolean }
      discard_campus_draft: {
        Args: { p_expected_updated_at: string; p_version_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_published_floor_plan: { Args: { p_path: string }; Returns: boolean }
      publish_campus_version: {
        Args: { p_version_id: string }
        Returns: string
      }
      publish_validated_campus_draft: {
        Args: { p_expected_updated_at: string; p_version_id: string }
        Returns: Json
      }
      record_campus_validation: {
        Args: {
          p_issues: Json
          p_score: number
          p_status: string
          p_version_id: string
        }
        Returns: string
      }
      save_campus_draft: {
        Args: {
          p_campus_id: string
          p_change_summary: string
          p_expected_updated_at: string
          p_snapshot: Json
          p_structure: Json
        }
        Returns: Json
      }
      save_campus_structure: {
        Args: { p_campus_id: string; p_payload: Json }
        Returns: Json
      }
      unpublish_campus_map: {
        Args: { p_campus_id: string; p_expected_updated_at: string }
        Returns: string
      }
      update_report_workflow: {
        Args: {
          p_internal_notes?: string
          p_report_id: string
          p_resolution_notes?: string
          p_status: string
        }
        Returns: {
          archived_at: string | null
          assigned_admin_id: string | null
          building_id: string | null
          campus_id: string
          category: string
          created_at: string
          description: string
          floor_id: string | null
          id: string
          internal_notes: string | null
          map_element_id: string | null
          priority: string
          reporter_id: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_system_settings: { Args: { p_entries: Json }; Returns: number }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
