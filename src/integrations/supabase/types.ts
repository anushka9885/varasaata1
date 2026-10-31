export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      game_stats: {
        Row: {
          created_at: string;
          difficulty: string | null;
          id: string;
          mode: string;
          result: string;
          rounds_lost: number;
          rounds_total: number;
          rounds_won: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          difficulty?: string | null;
          id?: string;
          mode: string;
          result: string;
          rounds_lost?: number;
          rounds_total: number;
          rounds_won?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          difficulty?: string | null;
          id?: string;
          mode?: string;
          result?: string;
          rounds_lost?: number;
          rounds_total?: number;
          rounds_won?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      policy_consents: {
        Row: {
          accepted_at: string;
          consent_source: string;
          id: string;
          privacy_policy_version: string;
          terms_version: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string;
          consent_source?: string;
          id?: string;
          privacy_policy_version: string;
          terms_version: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          consent_source?: string;
          id?: string;
          privacy_policy_version?: string;
          terms_version?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar: string;
          board_theme: string;
          created_at: string;
          display_name: string;
          language: string;
          p1_color: string;
          p2_color: string;
          sound_enabled: boolean;
          theme_mode: string;
          updated_at: string;
          user_id: string;
          username: string | null;
        };
        Insert: {
          avatar?: string;
          board_theme?: string;
          created_at?: string;
          display_name?: string;
          language?: string;
          p1_color?: string;
          p2_color?: string;
          sound_enabled?: boolean;
          theme_mode?: string;
          updated_at?: string;
          user_id: string;
          username?: string | null;
        };
        Update: {
          avatar?: string;
          board_theme?: string;
          created_at?: string;
          display_name?: string;
          language?: string;
          p1_color?: string;
          p2_color?: string;
          sound_enabled?: boolean;
          theme_mode?: string;
          updated_at?: string;
          user_id?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      game_invitations: {
        Row: {
          created_at: string;
          from_user_id: string;
          id: string;
          room_code: string;
          status: string;
          to_user_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          from_user_id: string;
          id?: string;
          room_code: string;
          status?: string;
          to_user_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          from_user_id?: string;
          id?: string;
          room_code?: string;
          status?: string;
          to_user_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      online_rooms: {
        Row: {
          code: string;
          created_at: string;
          game_state: Json | null;
          guest_color: string;
          guest_id: string | null;
          host_color: string;
          host_id: string;
          rounds: number;
          status: string;
          timer: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          game_state?: Json | null;
          guest_color?: string;
          guest_id?: string | null;
          host_color?: string;
          host_id: string;
          rounds?: number;
          status?: string;
          timer?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          game_state?: Json | null;
          guest_color?: string;
          guest_id?: string | null;
          host_color?: string;
          host_id?: string;
          rounds?: number;
          status?: string;
          timer?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      resolve_login_email: {
        Args: {
          p_username: string;
        };
        Returns: string | null;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
