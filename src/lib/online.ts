import { supabase } from "@/integrations/supabase/client";
import { broadcastLobbyEvent, subscribeToCrossTab } from "@/integrations/supabase/mock-client";
import { createGame, type GameState } from "@/game/engine";
import type { Json } from "@/integrations/supabase/types";

export interface RegisteredPlayer {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
}

export interface GameInvitation {
  id: string;
  fromUserId: string;
  fromUsername: string;
  fromDisplayName: string;
  fromAvatar: string;
  toUserId: string;
  roomCode: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  createdAt: string;
}

export interface OnlineRoom {
  code: string;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  guestId?: string | undefined;
  guestName?: string | undefined;
  guestAvatar?: string | undefined;
  status: "waiting" | "playing" | "finished" | "cancelled";
  createdAt: number;
  gameState?: GameState | undefined;
  hostColor: string;
  guestColor: string;
  timer: number;
  rounds: number;
}

export interface Friend {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
}

const STORAGE_KEY_ROOMS = "varasaata_rooms_v1";

function getStored<T>(key: string, def: T): T {
  if (typeof window === "undefined") return def;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : def;
  } catch {
    return def;
  }
}

function setStored<T>(key: string, val: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* ignore storage quota limits */
  }
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let res = "";
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

function saveLocalRoom(room: OnlineRoom) {
  const rooms = getStored<Record<string, OnlineRoom>>(STORAGE_KEY_ROOMS, {});
  rooms[room.code] = room;
  setStored(STORAGE_KEY_ROOMS, rooms);
  broadcastLobbyEvent("room_created", room);
}

// -------------------------------------------------------------
// 1. Search Real Registered Users by Username from Supabase
// -------------------------------------------------------------
export async function searchRegisteredPlayers(
  query: string,
  currentUserId: string,
): Promise<RegisteredPlayer[]> {
  const clean = query.trim().toLowerCase();
  if (!clean || clean.length < 2) return [];

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar")
      .neq("user_id", currentUserId)
      .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
      .limit(10);

    if (error) {
      console.warn("[Online] Player search query fallback:", error.message);
      // Fallback if username column was not yet provisioned in schema
      const fallback = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar")
        .neq("user_id", currentUserId)
        .ilike("display_name", `%${clean}%`)
        .limit(10);
      if (fallback.data) {
        return fallback.data.map(
          (r: { user_id: string; display_name: string; avatar?: string | null }) => ({
            userId: r.user_id,
            username: r.display_name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
            displayName: r.display_name,
            avatar: r.avatar || "🦚",
          }),
        );
      }
      return [];
    }

    if (!data) return [];
    return data.map((r) => ({
      userId: r.user_id,
      username: r.username || r.display_name.toLowerCase().replace(/[^a-z0-9_]/g, ""),
      displayName: r.display_name,
      avatar: r.avatar || "🦚",
    }));
  } catch (err: unknown) {
    console.warn("[Online] Player search error:", err);
    return [];
  }
}

// -------------------------------------------------------------
// 2. Real Game Invitations via Supabase & Realtime
// -------------------------------------------------------------
export async function sendGameInvitation(
  fromUser: { id: string; name: string; avatar: string },
  toUserId: string,
  options: { hostColor: string; guestColor: string; timer: number; rounds: number },
): Promise<{ success: boolean; room?: OnlineRoom | undefined; invitationId?: string | undefined; message: string }> {
  const code = generateRoomCode();
  const initialGameState = createGame(1);

  const localRoom: OnlineRoom = {
    code,
    hostId: fromUser.id,
    hostName: fromUser.name,
    hostAvatar: fromUser.avatar,
    status: "waiting",
    createdAt: Date.now(),
    hostColor: options.hostColor,
    guestColor: options.guestColor,
    timer: options.timer,
    rounds: options.rounds,
    gameState: initialGameState,
  };
  saveLocalRoom(localRoom);

  try {
    // 1. Create or upsert the online room in Supabase
    await supabase.from("online_rooms").upsert({
      code,
      host_id: fromUser.id,
      status: "waiting",
      host_color: options.hostColor,
      guest_color: options.guestColor,
      timer: options.timer,
      rounds: options.rounds,
      game_state: initialGameState as unknown as Json,
    });

    // 2. Insert game invitation
    const { data: invData, error: invErr } = await supabase
      .from("game_invitations")
      .insert({
        from_user_id: fromUser.id,
        to_user_id: toUserId,
        room_code: code,
        status: "pending",
      })
      .select()
      .maybeSingle();

    if (invErr) {
      console.warn("[Online] game_invitations insert fallback:", invErr.message);
    }

    broadcastLobbyEvent("game_invitation_sent", {
      fromUserId: fromUser.id,
      toUserId,
      roomCode: code,
    });

    return {
      success: true,
      room: localRoom,
      invitationId: invData?.id,
      message: "Game invitation sent!",
    };
  } catch (err: unknown) {
    console.error("[Online] sendGameInvitation failed:", err);
    return {
      success: true,
      room: localRoom,
      message: "Invitation sent!",
    };
  }
}

export async function getIncomingInvitations(userId: string): Promise<GameInvitation[]> {
  try {
    const { data, error } = await supabase
      .from("game_invitations")
      .select("id, from_user_id, to_user_id, room_code, status, created_at")
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) return [];

    const senderIds = Array.from(new Set(data.map((i) => i.from_user_id)));
    const { data: senders } = await supabase
      .from("profiles")
      .select("user_id, username, display_name, avatar")
      .in("user_id", senderIds);

    const senderMap = new Map((senders || []).map((s) => [s.user_id, s]));

    return data.map((inv) => {
      const sender = senderMap.get(inv.from_user_id);
      return {
        id: inv.id,
        fromUserId: inv.from_user_id,
        fromUsername: sender?.username || sender?.display_name || "Opponent",
        fromDisplayName: sender?.display_name || "Opponent",
        fromAvatar: sender?.avatar || "🦚",
        toUserId: inv.to_user_id,
        roomCode: inv.room_code,
        status: inv.status as GameInvitation["status"],
        createdAt: inv.created_at,
      };
    });
  } catch (err: unknown) {
    console.warn("[Online] getIncomingInvitations error:", err);
    return [];
  }
}

export async function respondToInvitation(
  invitationId: string,
  accept: boolean,
  guestUser: { id: string; name: string; avatar: string },
): Promise<{ success: boolean; room?: OnlineRoom | undefined; message: string }> {
  try {
    const nextStatus = accept ? "accepted" : "declined";
    const { data: inv, error: updateErr } = await supabase
      .from("game_invitations")
      .update({ status: nextStatus })
      .eq("id", invitationId)
      .select()
      .maybeSingle();

    if (updateErr) {
      console.warn("[Online] Invitation update failed:", updateErr.message);
    }

    if (accept && inv) {
      await supabase
        .from("online_rooms")
        .update({
          guest_id: guestUser.id,
          status: "playing",
        })
        .eq("code", inv.room_code);

      const room = await fetchRoom(inv.room_code, guestUser);
      broadcastLobbyEvent("invitation_response", {
        invitationId,
        status: "accepted",
        roomCode: inv.room_code,
        guestId: guestUser.id,
        guestName: guestUser.name,
      });

      return {
        success: true,
        room: room || undefined,
        message: "Invitation accepted! Joining room...",
      };
    }

    broadcastLobbyEvent("invitation_response", {
      invitationId,
      status: "declined",
    });

    return { success: true, message: "Invitation declined." };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to respond to invitation",
    };
  }
}

export function subscribeToInvitations(
  userId: string,
  onNewInvitation: (inv: GameInvitation) => void,
  onResponse: (inv: { id?: string | undefined; status?: GameInvitation["status"] | undefined; roomCode?: string | undefined }) => void,
): () => void {
  // Realtime channel
  const channel = supabase
    .channel(`invitations_${userId}`)
    .on(
      "postgres_changes" as "system",
      {
        event: "*",
        schema: "public",
        table: "game_invitations",
      },
      async (payload: {
        new?: {
          id?: string;
          to_user_id?: string;
          from_user_id?: string;
          room_code?: string;
          status?: string;
        };
      }) => {
        const record = payload.new;
        if (!record) return;
        if (record.to_user_id === userId && record.status === "pending" && record.id) {
          const list = await getIncomingInvitations(userId);
          const found = list.find((i) => i.id === record.id);
          if (found) onNewInvitation(found);
        } else if (record.from_user_id === userId) {
          onResponse({
            id: record.id,
            status: record.status as GameInvitation["status"],
            roomCode: record.room_code,
          });
        }
      },
    )
    .subscribe();

  // Cross-tab broadcast fallback
  const unsubCrossTab = subscribeToCrossTab((type, payload) => {
    if (type === "lobby_event") {
      const data = payload as {
        action?: string;
        payload?: {
          toUserId?: string;
          invitationId?: string;
          status?: GameInvitation["status"];
          roomCode?: string;
        };
      };
      if (data.action === "game_invitation_sent" && data.payload?.toUserId === userId) {
        getIncomingInvitations(userId).then((list) => {
          list.forEach((i) => onNewInvitation(i));
        });
      } else if (data.action === "invitation_response" && data.payload) {
        onResponse({
          id: data.payload.invitationId,
          status: data.payload.status,
          roomCode: data.payload.roomCode,
        });
      }
    }
  });

  // Short recovery polling timer (every 4 seconds)
  const pollTimer = setInterval(async () => {
    try {
      const list = await getIncomingInvitations(userId);
      list.forEach((inv) => onNewInvitation(inv));
    } catch {
      /* ignore poll errors */
    }
  }, 4000);

  return () => {
    clearInterval(pollTimer);
    unsubCrossTab();
    supabase.removeChannel(channel);
  };
}

// -------------------------------------------------------------
// 3. Room Management & Synchronized Gameplay
// -------------------------------------------------------------
export async function createRoom(
  hostId: string,
  hostName: string,
  hostAvatar: string,
  options: { hostColor: string; guestColor: string; timer: number; rounds: number },
): Promise<OnlineRoom> {
  const code = generateRoomCode();
  const room: OnlineRoom = {
    code,
    hostId,
    hostName,
    hostAvatar,
    status: "waiting",
    createdAt: Date.now(),
    hostColor: options.hostColor,
    guestColor: options.guestColor,
    timer: options.timer,
    rounds: options.rounds,
    gameState: createGame(1),
  };
  saveLocalRoom(room);

  try {
    await supabase.from("online_rooms").upsert({
      code,
      host_id: hostId,
      status: "waiting",
      host_color: options.hostColor,
      guest_color: options.guestColor,
      timer: options.timer,
      rounds: options.rounds,
      game_state: room.gameState as unknown as Json,
    });
  } catch (err: unknown) {
    console.warn("[Online] createRoom supabase write error:", err);
  }

  return room;
}

export async function fetchRoom(
  code: string,
  currentUser?: { id: string; name: string; avatar: string },
): Promise<OnlineRoom | null> {
  const norm = code.trim().toUpperCase();

  try {
    const { data } = await supabase.from("online_rooms").select("*").eq("code", norm).maybeSingle();

    if (data) {
      // Fetch host & guest names
      const participantIds = [data.host_id, data.guest_id].filter(Boolean) as string[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, avatar")
        .in("user_id", participantIds);

      const pMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      const hostP = pMap.get(data.host_id);
      const guestP = data.guest_id ? pMap.get(data.guest_id) : undefined;

      const room: OnlineRoom = {
        code: norm,
        hostId: data.host_id,
        hostName: hostP?.display_name || hostP?.username || "Host",
        hostAvatar: hostP?.avatar || "🦚",
        guestId: data.guest_id || undefined,
        guestName:
          guestP?.display_name ||
          guestP?.username ||
          (currentUser?.id === data.guest_id ? currentUser.name : undefined),
        guestAvatar:
          guestP?.avatar || (currentUser?.id === data.guest_id ? currentUser.avatar : undefined),
        status: data.status as OnlineRoom["status"],
        createdAt: new Date(data.created_at).getTime(),
        gameState: (data.game_state as unknown as GameState) || createGame(1),
        hostColor: data.host_color,
        guestColor: data.guest_color,
        timer: data.timer,
        rounds: data.rounds,
      };
      saveLocalRoom(room);
      return room;
    }
  } catch (err: unknown) {
    console.warn("[Online] fetchRoom error:", err);
  }

  // Fallback to local storage
  const rooms = getStored<Record<string, OnlineRoom>>(STORAGE_KEY_ROOMS, {});
  return rooms[norm] || null;
}

export function getRoom(code: string): OnlineRoom | null {
  const rooms = getStored<Record<string, OnlineRoom>>(STORAGE_KEY_ROOMS, {});
  return rooms[code.trim().toUpperCase()] || null;
}

export async function joinRoom(
  code: string,
  guestId: string,
  guestName: string,
  guestAvatar: string,
): Promise<OnlineRoom | null> {
  const norm = code.trim().toUpperCase();

  try {
    await supabase
      .from("online_rooms")
      .update({
        guest_id: guestId,
        status: "playing",
      })
      .eq("code", norm);
  } catch (err: unknown) {
    console.warn("[Online] joinRoom supabase update error:", err);
  }

  const room = await fetchRoom(norm, { id: guestId, name: guestName, avatar: guestAvatar });
  if (room) {
    room.guestId = guestId;
    room.guestName = guestName;
    room.guestAvatar = guestAvatar;
    room.status = "playing";
    saveLocalRoom(room);
    broadcastLobbyEvent("player_joined", room);
  }
  return room;
}

export async function updateRoomGame(code: string, gameState: GameState): Promise<void> {
  const norm = code.trim().toUpperCase();
  const rooms = getStored<Record<string, OnlineRoom>>(STORAGE_KEY_ROOMS, {});
  const room = rooms[norm];
  if (room) {
    room.gameState = gameState;
    if (gameState.winner !== null) room.status = "finished";
    rooms[norm] = room;
    setStored(STORAGE_KEY_ROOMS, rooms);
  }

  // Broadcast cross-tab and cross-device
  broadcastLobbyEvent("game_move", { code: norm, gameState });

  try {
    await supabase
      .from("online_rooms")
      .update({
        game_state: gameState as unknown as Json,
        status: gameState.winner !== null ? "finished" : "playing",
        updated_at: new Date().toISOString(),
      })
      .eq("code", norm);
  } catch (err: unknown) {
    console.warn("[Online] updateRoomGame supabase update warning:", err);
  }
}

export function subscribeToRoom(
  code: string,
  callbacks: {
    onRoomUpdated?: (room: OnlineRoom) => void;
    onMove?: (gameState: GameState) => void;
  },
): () => void {
  const norm = code.trim().toUpperCase();

  // Supabase Realtime channel
  const channel = supabase
    .channel(`room_${norm}`)
    .on(
      "postgres_changes" as "system",
      {
        event: "UPDATE",
        schema: "public",
        table: "online_rooms",
        filter: `code=eq.${norm}`,
      },
      async (payload: { new?: { game_state?: unknown } }) => {
        const record = payload.new;
        if (!record) return;
        if (record.game_state && callbacks.onMove) {
          callbacks.onMove(record.game_state as GameState);
        }
        if (callbacks.onRoomUpdated) {
          const r = await fetchRoom(norm);
          if (r) callbacks.onRoomUpdated(r);
        }
      },
    )
    .on(
      "broadcast",
      { event: "game_move" },
      (payload: { payload?: { code?: string; gameState?: GameState } }) => {
        if (payload.payload?.code === norm && payload.payload.gameState && callbacks.onMove) {
          callbacks.onMove(payload.payload.gameState);
        }
      },
    )
    .subscribe();

  // Cross-tab broadcast listener
  const unsubCrossTab = subscribeToCrossTab((type, payload) => {
    if (type === "lobby_event") {
      const data = payload as {
        action?: string;
        payload?: { code?: string; gameState?: GameState; [key: string]: unknown };
      };
      if (data.action === "game_move" && data.payload?.code === norm && callbacks.onMove) {
        callbacks.onMove(data.payload.gameState as GameState);
      } else if (
        data.action === "player_joined" &&
        data.payload?.code === norm &&
        callbacks.onRoomUpdated
      ) {
        callbacks.onRoomUpdated(data.payload as unknown as OnlineRoom);
      }
    }
  });

  // Short polling recovery (every 3 seconds)
  const pollInterval = setInterval(async () => {
    const current = await fetchRoom(norm);
    if (current) {
      if (current.guestId && callbacks.onRoomUpdated) callbacks.onRoomUpdated(current);
      if (current.gameState && callbacks.onMove) callbacks.onMove(current.gameState);
    }
  }, 3000);

  return () => {
    clearInterval(pollInterval);
    unsubCrossTab();
    supabase.removeChannel(channel);
  };
}
