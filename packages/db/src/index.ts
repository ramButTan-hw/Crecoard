// Database types — generated from Supabase schema
// Run: supabase gen types typescript --local > packages/db/src/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      boards: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          is_public: boolean;
          background_color: string;
          background_image: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["boards"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["boards"]["Insert"]>;
      };
      boxes: {
        Row: {
          id: string;
          board_id: string;
          x: number;
          y: number;
          width: number;
          height: number;
          z_index: number;
          locked: boolean;
          title: string;
          content: Json;
          style: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["boxes"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["boxes"]["Insert"]>;
      };
      servers: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          icon: string | null;
          description: string | null;
          is_public: boolean;
          invite_code: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["servers"]["Row"], "created_at">;
        Update: Partial<Database["public"]["Tables"]["servers"]["Insert"]>;
      };
      server_members: {
        Row: {
          server_id: string;
          user_id: string;
          role: "owner" | "admin" | "member";
          joined_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["server_members"]["Row"], "joined_at">;
        Update: Partial<Database["public"]["Tables"]["server_members"]["Insert"]>;
      };
      channels: {
        Row: {
          id: string;
          server_id: string;
          name: string;
          type: "text" | "announcement";
          position: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["channels"]["Row"], "created_at">;
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          channel_id: string | null;
          dm_recipient_id: string | null;
          sender_id: string;
          content: string;
          edited: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["messages"]["Row"], "created_at" | "edited">;
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
      };
    };
  };
}
