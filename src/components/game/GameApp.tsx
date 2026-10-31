import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  LogOut,
  RotateCcw,
  Undo2,
  Volume2,
  VolumeX,
  Volume1,
  RefreshCw,
  Trophy,
  Users,
  Settings as SettingsIcon,
  Gamepad2,
  Sun,
  Moon,
  Copy,
  Check,
  Search,
  UserPlus,
  Play,
  Flame,
  Swords,
  Globe,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Logo, Title, LegalLinks } from "@/components/brand";
import { Board, STONE_COLORS, stoneBg } from "./Board";
import {
  capture,
  capturable,
  createGame,
  startingPlayer,
  hand,
  move,
  movesFrom,
  onBoard,
  other,
  place,
  timeout,
  IllegalMoveError,
  type GameState,
  type Player,
} from "@/game/engine";
import { chooseMove, type Difficulty } from "@/game/ai";
import { playTone, setSoundVolume } from "@/game/sound";
import { cancelPendingAds, hideBanner, initAds, maybeShowInterstitial, showBanner } from "@/lib/ads";
import { translations, type Language } from "@/lib/i18n";
import {
  createRoom,
  joinRoom,
  getRoom,
  fetchRoom,
  updateRoomGame,
  searchRegisteredPlayers,
  sendGameInvitation,
  getIncomingInvitations,
  respondToInvitation,
  subscribeToInvitations,
  subscribeToRoom,
  type OnlineRoom,
  type RegisteredPlayer,
  type GameInvitation,
} from "@/lib/online";
import { subscribeToCrossTab } from "@/integrations/supabase/mock-client";
import { triggerHaptic } from "@/lib/haptics";
import { registerBackHandler } from "@/lib/back-button";

export const AVATARS = ["🦚", "🐘", "🐅", "🪷", "🦁", "🦅", "🐎", "🌞", "👑", "⚔️", "💎", "🪔"];

export type BoardTheme = "wood" | "midnight" | "jade" | "ivory";
type ActiveTab = "play" | "dashboard" | "online" | "friends" | "settings" | "rules";
type Dlg = null | "back" | "restart" | "newmatch" | "logout" | "rules" | "win_celebration";

interface MatchHistoryItem {
  id: string;
  opponent: string;
  mode: string;
  result: "win" | "loss" | "draw";
  score: [number, number];
  date: string;
}

interface AppSettings {
  mode: "ai" | "local" | "online";
  difficulty: Difficulty;
  rounds: 1 | 3 | 5 | 7;
  timer: 0 | 30 | 60 | 180 | 300;
  names: [string, string];
  avatars: [string, string];
  colors: [string, string];
  boardTheme: BoardTheme;
  themeMode: "dark" | "light";
  language: Language;
  sound: boolean;
  volume: number;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function GameApp({ userId }: { userId: string }) {
  const navigate = useNavigate();

  // Navigation state
  const [activeTab, setActiveTab] = useState<ActiveTab>("play");

  // Core App & Match Settings
  const [settings, setSettings] = useState<AppSettings>({
    mode: "ai",
    difficulty: "normal",
    rounds: 3,
    timer: 0,
    names: ["You", "Computer"],
    avatars: ["🦚", "🐅"],
    colors: ["emerald", "ruby"],
    boardTheme: "wood",
    themeMode: "dark",
    language: "en",
    sound: true,
    volume: 0.6,
  });

  const t = translations[settings.language] || translations.en;

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);

  // Statistics & History
  const [stats, setStats] = useState({
    wins: 0,
    losses: 0,
    draws: 0,
    total: 0,
    currentStreak: 0,
    bestStreak: 0,
  });
  const [historyList, setHistoryList] = useState<MatchHistoryItem[]>([]);

  // In-Game State
  const [game, setGame] = useState<GameState>(() => createGame(1));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [matchOver, setMatchOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [dialog, setDialog] = useState<Dlg>(null);
  const scoredRef = useRef(false);
  const roundStarterRef = useRef<Player>(1);
  const startMatchRef = useRef<() => void>(() => {});

  // Online Multiplayer & Invitations State
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentRoom, setCurrentRoom] = useState<OnlineRoom | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [playerSearchInput, setPlayerSearchInput] = useState("");
  const [searchedPlayers, setSearchedPlayers] = useState<RegisteredPlayer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [incomingInvitations, setIncomingInvitations] = useState<GameInvitation[]>([]);
  const [outgoingInvitation, setOutgoingInvitation] = useState<{
    toUser: RegisteredPlayer;
    roomCode: string;
    invitationId?: string | undefined;
  } | null>(null);

  // Settings State (Change Password)
  const [passwordState, setPasswordState] = useState({
    newPassword: "",
    confirmPassword: "",
    updating: false,
  });

  // Sound helper
  const sfx = useCallback(
    (kind: Parameters<typeof playTone>[0]) => {
      if (settings.sound) playTone(kind, settings.volume);
    },
    [settings.sound, settings.volume],
  );

  // Apply light/dark mode and sound volume to environment
  useEffect(() => {
    setSoundVolume(settings.sound ? settings.volume : 0);
  }, [settings.sound, settings.volume]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      if (settings.themeMode === "light") {
        root.classList.remove("dark");
        root.classList.add("light");
        root.setAttribute("data-theme", "light");
      } else {
        root.classList.remove("light");
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
      }
    }
  }, [settings.themeMode]);

  // Ads initialization
  useEffect(() => {
    void initAds();
  }, []);
  useEffect(() => {
    if (playing) void hideBanner();
    else void showBanner();
  }, [playing]);
  // Register Android hardware back button handler
  useEffect(() => {
    const unregister = registerBackHandler(() => {
      // 1. If any dialog is open, dismiss it
      if (dialog !== null) {
        setDialog(null);
        return true;
      }
      // 2. If actively playing a match
      if (playing) {
        if (matchOver) {
          setPlaying(false);
        } else {
          setDialog("back");
        }
        return true;
      }
      // 3. If in a sub-tab, return to the main "play" tab
      if (activeTab !== "play") {
        setActiveTab("play");
        return true;
      }
      // 4. Default: allow exit or browser back
      return false;
    });
    return unregister;
  }, [dialog, playing, matchOver, activeTab, matchOver]);


  const paused = dialog !== null;
  const isAiTurn = settings.mode === "ai" && game.turn === 2 && game.winner === null;
  const isOnlineMyTurn =
    settings.mode === "online" &&
    currentRoom !== null &&
    ((currentRoom.hostId === userId && game.turn === 1) ||
      (currentRoom.guestId === userId && game.turn === 2));

  // Load User Profile and Match Statistics
  const loadStats = useCallback(async () => {
    const { data } = await supabase
      .from("game_stats")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (data) {
      const wins = data.filter((r) => r.result === "win").length;
      const losses = data.filter((r) => r.result === "loss").length;
      const draws = data.filter((r) => r.result === "draw").length;

      // Compute streak
      let currStreak = 0;
      let bestStreak = 0;
      for (const item of data) {
        if (item.result === "win") {
          currStreak++;
          if (currStreak > bestStreak) bestStreak = currStreak;
        } else {
          currStreak = 0;
        }
      }

      setStats({
        wins,
        losses,
        draws,
        total: data.length,
        currentStreak: data[0]?.result === "win" ? currStreak : 0,
        bestStreak,
      });

      setHistoryList(
        data.slice(0, 15).map((row) => ({
          id: row.id || Math.random().toString(),
          opponent:
            row.mode === "ai"
              ? `Computer (${row.difficulty || "Normal"})`
              : row.mode === "online"
                ? "Online Opponent"
                : "Local Player 2",
          mode: row.mode || "ai",
          result: (row.result === "win" || row.result === "loss" ? row.result : "draw") as
            | "draw"
            | "win"
            | "loss",
          score: [row.rounds_won || 0, row.rounds_lost || 0],
          date: row.created_at ? new Date(row.created_at).toLocaleDateString() : "Recent",
        })),
      );
    }
  }, [userId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        if (data.username) setCurrentUsername(data.username);
        setSettings((s) => ({
          ...s,
          names: [data.display_name || data.username || "You", s.names[1]],
          avatars: [data.avatar || "🦚", s.avatars[1]],
          colors: [data.p1_color || "emerald", data.p2_color || "ruby"],
          boardTheme: (data.board_theme as BoardTheme) || "wood",
          themeMode: (data.theme_mode as "dark" | "light") || "dark",
          language: (data.language as Language) || "en",
          sound: data.sound_enabled ?? true,
        }));
      }
      setProfileLoaded(true);
    })();
    loadStats();
  }, [userId, loadStats]);

  // Realtime subscription for invitations
  useEffect(() => {
    if (!userId) return;

    getIncomingInvitations(userId).then((list) => {
      setIncomingInvitations(list);
    });

    const unsub = subscribeToInvitations(
      userId,
      (newInv) => {
        setIncomingInvitations((prev) => {
          if (prev.some((i) => i.id === newInv.id)) return prev;
          sfx("mill");
          toast.info(`Game challenge received from @${newInv.fromUsername}!`);
          return [newInv, ...prev];
        });
      },
      (response) => {
        if (response.id && outgoingInvitation && response.id === outgoingInvitation.invitationId) {
          if (response.status === "accepted") {
            sfx("win");
            toast.success(`@${outgoingInvitation.toUser.username} accepted your challenge!`);
            if (response.roomCode) {
              fetchRoom(response.roomCode).then((r) => {
                if (r) {
                  setCurrentRoom(r);
                  setSettings((s) => ({
                    ...s,
                    mode: "online",
                    names: [
                      s.names[0],
                      outgoingInvitation.toUser.displayName || outgoingInvitation.toUser.username,
                    ],
                    avatars: [s.avatars[0], outgoingInvitation.toUser.avatar],
                    colors: [r.hostColor, r.guestColor],
                  }));
                  setOutgoingInvitation(null);
                  startMatchRef.current();
                }
              });
            }
          } else if (response.status === "declined") {
            sfx("error");
            toast.error(`@${outgoingInvitation.toUser.username} declined your invitation.`);
            setOutgoingInvitation(null);
          }
        }
      },
    );

    return unsub;
  }, [userId, outgoingInvitation, sfx]);

  // Online Room State Synchronization
  useEffect(() => {
    if (!currentRoom?.code || settings.mode !== "online") return;

    const unsub = subscribeToRoom(currentRoom.code, {
      onMove: (remoteGameState) => {
        setGame(remoteGameState);
        sfx("place");
      },
      onRoomUpdated: (updatedRoom) => {
        setCurrentRoom(updatedRoom);
        if (updatedRoom.guestName && !playing) {
          toast.success(`${updatedRoom.guestName} joined the room!`);
          sfx("win");
          setSettings((s) => ({
            ...s,
            names: [s.names[0], updatedRoom.guestName || "Guest"],
            avatars: [s.avatars[0], updatedRoom.guestAvatar || "🐅"],
          }));
        }
      },
    });

    return unsub;
  }, [currentRoom?.code, settings.mode, playing, sfx]);

  const savePrefs = async (s: AppSettings) => {
    sfx("click");
    await supabase
      .from("profiles")
      .upsert({
        user_id: userId,
        display_name: s.names[0],
        avatar: s.avatars[0],
        p1_color: s.colors[0],
        p2_color: s.colors[1],
        board_theme: s.boardTheme,
        theme_mode: s.themeMode,
        language: s.language,
        sound_enabled: s.sound,
      })
      .eq("user_id", userId);
    toast.success(t.savedSuccessfully);
  };

  // Game Flow Controls
  const startRound = useCallback(
    (starter: Player = startingPlayer(Math.random()), usedMills: string[] = []) => {
      roundStarterRef.current = starter;
      setGame(createGame(starter, usedMills));
      setHistory([]);
      setSelected(null);
      scoredRef.current = false;
    },
    [],
  );

  const startMatch = () => {
    if (settings.colors[0] === settings.colors[1]) {
      sfx("error");
      return toast.error("Choose two different stone colours.");
    }
    sfx("click");
    cancelPendingAds();
    savePrefs(settings);
    setScores([0, 0]);
    setRound(1);
    setMatchOver(false);
    startRound();
    setPlaying(true);
    setActiveTab("play");
  };
  startMatchRef.current = startMatch;

  const commit = (next: GameState, prev: GameState) => {
    setHistory((h) => [...h, prev]);
    setGame(next);

    if (settings.mode === "online" && currentRoom) {
      updateRoomGame(currentRoom.code, next);
    }

    if (next.lastMove?.captured !== undefined && prev.pendingCapture) {
      sfx("capture");
      void triggerHaptic("heavy");
    } else if (next.pendingCapture) {
      sfx("mill");
      void triggerHaptic("success");
      toast.success(t.formedMill);
    } else {
      sfx("place");
      void triggerHaptic("medium");
    }
  };

  const onPoint = (i: number) => {
    if (game.winner !== null || paused) return;
    if (settings.mode === "ai" && isAiTurn) return;
    if (settings.mode === "online" && !isOnlineMyTurn) {
      toast.message("Waiting for opponent's move...");
      return;
    }

    try {
      if (game.pendingCapture) {
        if (!capturable(game).includes(i)) {
          sfx("error");
          void triggerHaptic("warning");
          return toast.message(
            game.board[i] === other(game.turn) ? t.protectedByMill : t.chooseOpponentStone,
          );
        }
        return commit(capture(game, i), game);
      }
      if (hand(game, game.turn) > 0) {
        if (game.board[i] !== 0) return;
        return commit(place(game, i), game);
      }
      if (game.board[i] === game.turn) {
        setSelected(movesFrom(game, i).length ? i : null);
        if (!movesFrom(game, i).length) {
          sfx("error");
          void triggerHaptic("warning");
          toast.message(t.noFreeNeighbours);
        } else {
          sfx("click");
          void triggerHaptic("light");
        }
        return;
      }
      if (selected !== null && game.board[i] === 0) {
        commit(move(game, selected, i), game);
        setSelected(null);
      }
    } catch (e) {
      if (e instanceof IllegalMoveError) {
        sfx("error");
        void triggerHaptic("warning");
        toast.message(e.message);
      } else throw e;
    }
  };

  // AI Turn Handling
  useEffect(() => {
    if (!playing || !isAiTurn || paused) return;
    const delay =
      settings.difficulty === "master" ? 450 : settings.difficulty === "hard" ? 400 : 650;
    const timerId = setTimeout(() => {
      const m = chooseMove(game, settings.difficulty);
      if (!m) return;
      let nextState = m.from === undefined ? place(game, m.to) : move(game, m.from, m.to);
      const snap = game;
      if (nextState.pendingCapture && m.capture !== undefined) {
        nextState = capture(nextState, m.capture);
        sfx("capture");
      } else {
        sfx("place");
      }
      setHistory((h) => [...h, snap]);
      setGame(nextState);
    }, delay);
    return () => clearTimeout(timerId);
  }, [playing, isAiTurn, paused, game, settings.difficulty, sfx]);

  // Move Timer Logic
  const isFreshRound = history.length === 0;
  useEffect(() => {
    setTimeLeft(settings.timer);
  }, [game.turn, round, settings.timer, isFreshRound]);

  useEffect(() => {
    if (!playing || settings.timer === 0 || paused || game.winner !== null) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 5 && t > 1) sfx("tick");
        return Math.max(0, t - 1);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [playing, settings.timer, paused, game.winner, sfx]);

  useEffect(() => {
    if (playing && settings.timer > 0 && timeLeft === 0 && game.winner === null && !paused) {
      setGame((g) => timeout(g));
      sfx("lose");
    }
  }, [timeLeft, playing, settings.timer, game.winner, paused, sfx]);

  // Round End Scoring & Stats Recording
  useEffect(() => {
    if (game.winner === null || scoredRef.current) return;
    scoredRef.current = true;

    const ns: [number, number] = [...scores];
    if (game.winner === 1 || game.winner === 2) {
      ns[game.winner - 1] += 1;
    }
    setScores(ns);

    if (game.winner === 1) {
      sfx("win");
      void triggerHaptic("success");
    } else if (game.winner === 2) {
      sfx("lose");
      void triggerHaptic("warning");
    }

    const need = Math.ceil(settings.rounds / 2);
    if (ns[0] >= need || ns[1] >= need || round >= settings.rounds) {
      setMatchOver(true);
      if (ns[0] > ns[1]) void triggerHaptic("success");
      else if (ns[0] < ns[1]) void triggerHaptic("error");
      setTimeout(() => void maybeShowInterstitial(), 1500);
      const result = ns[0] > ns[1] ? "win" : ns[0] < ns[1] ? "loss" : "draw";

      supabase
        .from("game_stats")
        .insert({
          user_id: userId,
          mode: settings.mode,
          difficulty: settings.mode === "ai" ? settings.difficulty : null,
          result,
          rounds_total: settings.rounds,
          rounds_won: ns[0],
          rounds_lost: ns[1],
        })
        .then(() => loadStats());
    }
  }, [
    game.winner,
    scores,
    round,
    settings.rounds,
    settings.mode,
    settings.difficulty,
    userId,
    loadStats,
    sfx,
  ]);

  // Undo Move
  const undo = () => {
    if (!history.length || game.winner !== null) return;
    sfx("click");
    const h = history.slice();
    let s = h.pop()!;
    if (settings.mode === "ai") {
      while ((s.turn !== 1 || s.pendingCapture) && h.length) s = h.pop()!;
      if (s.turn !== 1) return;
    }
    setHistory(h);
    setGame(s);
    setSelected(null);
  };

  const nextRound = () => {
    sfx("click");
    const r = round + 1;
    setRound(r);
    startRound(undefined, game.usedMills);
  };

  const quit = () => {
    cancelPendingAds();
    setDialog(null);
    setPlaying(false);
  };

  const logout = async () => {
    setDialog(null);
    sfx("click");
    await supabase.auth.signOut();
    navigate({ to: "/signin" });
  };

  // Password update handler
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordState.newPassword) return toast.error("Enter a new password.");
    if (passwordState.newPassword.length < 6)
      return toast.error("Password must be at least 6 characters.");
    if (passwordState.newPassword !== passwordState.confirmPassword) {
      return toast.error("Passwords do not match.");
    }
    setPasswordState((prev) => ({ ...prev, updating: true }));
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordState.newPassword });
      if (error) throw error;
      toast.success(t.savedSuccessfully);
      setPasswordState({ newPassword: "", confirmPassword: "", updating: false });
      sfx("win");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
      setPasswordState((prev) => ({ ...prev, updating: false }));
    }
  };

  // Online Multiplayer & Real Invitation Handlers
  const handleCreateRoom = async () => {
    sfx("click");
    const room = await createRoom(userId, settings.names[0], settings.avatars[0], {
      hostColor: settings.colors[0],
      guestColor: settings.colors[1],
      timer: settings.timer,
      rounds: settings.rounds,
    });
    setCurrentRoom(room);
    setSettings((s) => ({ ...s, mode: "online" }));
    toast.success(`Room ${room.code} created! Share code with your friend.`);
  };

  const handleJoinRoom = async () => {
    if (!joinCodeInput.trim()) return toast.error("Enter a room code.");
    sfx("click");
    const room = await joinRoom(joinCodeInput, userId, settings.names[0], settings.avatars[0]);
    if (!room) return toast.error("Room not found or expired. Check the code.");
    setCurrentRoom(room);
    setSettings((s) => ({
      ...s,
      mode: "online",
      names: [s.names[0], room.hostName],
      avatars: [s.avatars[0], room.hostAvatar],
      colors: [room.guestColor, room.hostColor],
    }));
    toast.success(`Joined room ${room.code}! Connected with ${room.hostName}.`);
    startMatch();
  };

  const handleCopyCode = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.code);
    setCopiedCode(true);
    sfx("click");
    toast.success("Room code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSearchPlayers = async (query: string) => {
    setPlayerSearchInput(query);
    if (!query.trim() || query.trim().length < 2) {
      setSearchedPlayers([]);
      return;
    }
    setIsSearching(true);
    const results = await searchRegisteredPlayers(query, userId);
    setSearchedPlayers(results);
    setIsSearching(false);
  };

  const handleInvitePlayer = async (targetPlayer: RegisteredPlayer) => {
    sfx("click");
    toast.info(`Sending game invitation to @${targetPlayer.username}...`);
    const res = await sendGameInvitation(
      { id: userId, name: settings.names[0], avatar: settings.avatars[0] },
      targetPlayer.userId,
      {
        hostColor: settings.colors[0],
        guestColor: settings.colors[1],
        timer: settings.timer,
        rounds: settings.rounds,
      },
    );

    if (res.success && res.room) {
      setCurrentRoom(res.room);
      setOutgoingInvitation({
        toUser: targetPlayer,
        roomCode: res.room.code,
        invitationId: res.invitationId,
      });
      setSettings((s) => ({
        ...s,
        mode: "online",
        names: [s.names[0], targetPlayer.displayName || targetPlayer.username],
        avatars: [s.avatars[0], targetPlayer.avatar],
      }));
      toast.success(`Invitation sent to @${targetPlayer.username}! Waiting for response...`);
    } else {
      sfx("error");
      toast.error(res.message || "Failed to send invitation.");
    }
  };

  const handleAcceptInvitation = async (inv: GameInvitation) => {
    sfx("win");
    toast.info(`Accepting invitation from @${inv.fromUsername}...`);
    const res = await respondToInvitation(inv.id, true, {
      id: userId,
      name: settings.names[0],
      avatar: settings.avatars[0],
    });

    const joinedRoom = res.room;
    if (res.success && joinedRoom) {
      setIncomingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
      setCurrentRoom(joinedRoom);
      setSettings((s) => ({
        ...s,
        mode: "online",
        names: [s.names[0], inv.fromDisplayName || inv.fromUsername],
        avatars: [s.avatars[0], inv.fromAvatar],
        colors: [joinedRoom.guestColor, joinedRoom.hostColor],
      }));
      toast.success(`Joined room with @${inv.fromUsername}!`);
      startMatch();
    } else {
      sfx("error");
      toast.error(res.message || "Could not join game.");
    }
  };

  const handleDeclineInvitation = async (inv: GameInvitation) => {
    sfx("click");
    await respondToInvitation(inv.id, false, {
      id: userId,
      name: settings.names[0],
      avatar: settings.avatars[0],
    });
    setIncomingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    toast.message(`Declined invitation from @${inv.fromUsername}`);
  };

  const handleCancelOutgoingInvitation = () => {
    setOutgoingInvitation(null);
    toast.message("Invitation cancelled.");
  };

  const capList = useMemo(
    () => (game.pendingCapture && !isAiTurn ? capturable(game) : []),
    [game, isAiTurn],
  );
  const targets = selected !== null ? movesFrom(game, selected) : [];
  const playerName = (p: Player) => settings.names[p - 1] || `Player ${p}`;

  const instruction = (() => {
    if (game.winner !== null) return "";
    if (isAiTurn) return "Computer is thinking…";
    if (game.pendingCapture) return t.formedMill;
    if (hand(game, game.turn) > 0) return t.turnPhasePlacement;
    return selected === null ? t.turnPhaseMovement : "Tap a glowing target point.";
  })();

  // Shared Navigation Header with Safe-Area Inset
  const header = (
    <header
      className="flex w-full max-w-5xl items-center justify-between gap-2 px-4 py-2.5 border-b border-amber-900/30 backdrop-blur-md sticky top-0 z-40 bg-[#140e0a]/90 text-amber-50"
      style={{
        paddingTop: "max(0.6rem, env(safe-area-inset-top, 0px))",
      }}
    >
      <div className="flex items-center gap-2.5">
        {playing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void triggerHaptic("light");
              if (matchOver) setPlaying(false);
              else setDialog("back");
            }}
            className="h-8 px-2 text-xs text-amber-200 hover:text-white hover:bg-amber-950/40"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span>Lobby</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Logo size={36} />
            <div>
              <Title small />
            </div>
          </div>
        )}
      </div>

      {/* User Avatar & Username Pill */}
      {currentUsername && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
          <span className="text-sm">{settings.avatars[0]}</span>
          <span className="font-mono font-medium max-w-[90px] truncate sm:max-w-xs">
            @{currentUsername}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1">
        {/* Rules button */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="How to play rules"
          onClick={() => {
            void triggerHaptic("light");
            sfx("click");
            setActiveTab("rules");
          }}
          className="h-8 w-8 rounded-full text-amber-200/80 hover:text-amber-100 hover:bg-amber-950/40"
        >
          <BookOpen className="h-4 w-4" />
        </Button>

        {/* Audio Mute/Unmute */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={settings.sound ? "Mute audio" : "Unmute audio"}
          onClick={() => {
            void triggerHaptic("light");
            sfx("click");
            setSettings((s) => ({ ...s, sound: !s.sound }));
          }}
          className="h-8 w-8 rounded-full text-amber-200/80 hover:text-amber-100 hover:bg-amber-950/40"
        >
          {settings.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </Button>

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          onClick={() => {
            void triggerHaptic("light");
            setDialog("logout");
          }}
          className="h-8 w-8 rounded-full text-stone-400 hover:text-rose-400 hover:bg-rose-950/30"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );

  // Native Fixed Bottom Navigation Bar (Home/Play, Lobby, Friends, Stats, Profile)
  const navTabs = (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-[#140e0a]/95 border-t border-amber-900/35 backdrop-blur-xl shadow-[0_-8px_25px_rgba(0,0,0,0.65)]"
      style={{
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        <button
          type="button"
          onClick={() => {
            void triggerHaptic("selection");
            sfx("click");
            setActiveTab("play");
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
            activeTab === "play"
              ? "text-amber-300 bg-amber-500/15 ring-1 ring-amber-500/30 shadow-sm"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          <Gamepad2 className={`h-5 w-5 mb-0.5 ${activeTab === "play" ? "text-amber-400" : ""}`} />
          <span>{t.playGame}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            void triggerHaptic("selection");
            sfx("click");
            setActiveTab("online");
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
            activeTab === "online"
              ? "text-amber-300 bg-amber-500/15 ring-1 ring-amber-500/30 shadow-sm"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          <Globe className={`h-5 w-5 mb-0.5 ${activeTab === "online" ? "text-amber-400" : ""}`} />
          <span>{t.onlineMultiplayer}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            void triggerHaptic("selection");
            sfx("click");
            setActiveTab("friends");
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
            activeTab === "friends"
              ? "text-amber-300 bg-amber-500/15 ring-1 ring-amber-500/30 shadow-sm"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          <Users className={`h-5 w-5 mb-0.5 ${activeTab === "friends" ? "text-amber-400" : ""}`} />
          <span>{t.friends}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            void triggerHaptic("selection");
            sfx("click");
            setActiveTab("dashboard");
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
            activeTab === "dashboard"
              ? "text-amber-300 bg-amber-500/15 ring-1 ring-amber-500/30 shadow-sm"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          <Trophy className={`h-5 w-5 mb-0.5 ${activeTab === "dashboard" ? "text-amber-400" : ""}`} />
          <span>{t.dashboard}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            void triggerHaptic("selection");
            sfx("click");
            setActiveTab("settings");
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
            activeTab === "settings"
              ? "text-amber-300 bg-amber-500/15 ring-1 ring-amber-500/30 shadow-sm"
              : "text-stone-400 hover:text-stone-200"
          }`}
        >
          <SettingsIcon className={`h-5 w-5 mb-0.5 ${activeTab === "settings" ? "text-amber-400" : ""}`} />
          <span>{t.settings}</span>
        </button>
      </div>
    </nav>
  );

  // Dialogs
  const dialogs = (
    <>
      <AlertDialog open={dialog === "back"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this match?</AlertDialogTitle>
            <AlertDialogDescription>
              Your active game will end if you leave now. Do you want to return to the lobby?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Playing</AlertDialogCancel>
            <AlertDialogAction
              onClick={quit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "restart"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart this round?</AlertDialogTitle>
            <AlertDialogDescription>
              The board will reset for this round while preserving match score.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDialog(null);
                startRound(roundStarterRef.current, game.usedMills);
              }}
            >
              Restart Round
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "newmatch"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a fresh match?</AlertDialogTitle>
            <AlertDialogDescription>
              Match scores and current board will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDialog(null);
                startMatch();
              }}
            >
              New Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "logout"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.signOut}?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll return to the sign-in screen. Your stats and preferences will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={logout}>{t.signOut}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  // Active Game Screen
  if (playing) {
    const need = Math.ceil(settings.rounds / 2);
    return (
      <div
        className={`theme-${settings.boardTheme} flex min-h-screen flex-col items-center select-none`}
      >
        {header}
        <main className="flex w-full max-w-5xl flex-col items-center gap-4 px-3 py-4 pb-12 lg:flex-row lg:items-start lg:justify-center">
          {/* Game Status & Controls Panel */}
          <div className="flex w-full max-w-md flex-col gap-3 lg:order-2">
            <div className="panel p-4 text-center shadow-lg">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground pb-2 border-b border-border/40">
                <span>{t.roundHeader(round, settings.rounds)}</span>
                <span className="font-semibold text-primary">First to {need} wins</span>
              </div>

              {game.winner === null ? (
                <div className="mt-3 flex items-center justify-center gap-2 text-lg font-semibold">
                  <span
                    className="inline-block h-5 w-5 rounded-full shadow-stone border border-white/20 animate-pulse"
                    style={{ background: stoneBg(settings.colors[game.turn - 1]) }}
                  />
                  <span>
                    {settings.avatars[game.turn - 1]} {playerName(game.turn)}'s turn
                  </span>
                  {settings.timer > 0 && (
                    <span
                      className={`ml-3 px-2 py-0.5 rounded font-mono text-sm font-bold ${
                        timeLeft <= 10
                          ? "bg-destructive text-destructive-foreground animate-bounce"
                          : "bg-primary/20 text-primary"
                      }`}
                      aria-live="polite"
                    >
                      {fmt(timeLeft)}
                    </span>
                  )}
                </div>
              ) : null}

              <p
                className="mt-2 text-sm font-medium text-amber-300 dark:text-amber-200"
                aria-live="polite"
              >
                {instruction}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Used mills: {game.usedMills.length} / 16</span>
              </div>
            </div>

            {/* Players HUD Cards */}
            {([1, 2] as Player[]).map((p) => {
              const isActive = game.turn === p && game.winner === null;
              return (
                <div
                  key={p}
                  className={`panel flex items-center justify-between p-3.5 transition-all ${
                    isActive ? "ring-2 ring-primary shadow-md scale-[1.02]" : "opacity-85"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-3xl">{settings.avatars[p - 1]}</span>
                    <div>
                      <div className="font-semibold text-base flex items-center gap-1.5">
                        <span>{playerName(p)}</span>
                        {isActive && (
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ background: stoneBg(settings.colors[p - 1]) }}
                        />
                        <span>{t.stonesInHand(hand(game, p))}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div className="text-xs text-muted-foreground">
                      <div>{t.stonesOnBoard(onBoard(game, p))}</div>
                    </div>
                    <div className="font-display text-2xl font-bold text-primary min-w-8 text-center bg-muted/30 px-2 py-1 rounded-lg">
                      {scores[p - 1]}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* In-Game Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialog("back")} className="h-11">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                {t.backToLobby}
              </Button>
              <Button
                variant="outline"
                onClick={undo}
                disabled={
                  !history.length || game.winner !== null || isAiTurn || settings.mode === "online"
                }
                className="h-11"
              >
                <Undo2 className="mr-1.5 h-4 w-4" />
                {t.undoMove}
              </Button>
              <Button variant="outline" onClick={() => setDialog("restart")} className="h-11">
                <RotateCcw className="mr-1.5 h-4 w-4" />
                {t.restartMatch}
              </Button>
              <Button variant="outline" onClick={() => setDialog("newmatch")} className="h-11">
                <RefreshCw className="mr-1.5 h-4 w-4" />
                {t.newMatch}
              </Button>
            </div>
          </div>

          {/* Interactive Game Board */}
          <div className="relative flex w-full max-w-[32rem] justify-center lg:order-1">
            <Board
              state={game}
              colors={settings.colors}
              selected={selected}
              targets={targets}
              capturable={capList}
              animate
              disabled={
                isAiTurn || game.winner !== null || (settings.mode === "online" && !isOnlineMyTurn)
              }
              onPoint={onPoint}
            />

            {/* Round / Match Victory Overlay */}
            {game.winner !== null && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/85 backdrop-blur-md z-30 p-4 animate-in fade-in zoom-in-95">
                <div className="panel p-6 text-center max-w-sm w-full shadow-2xl border-2 border-primary/50">
                  <div className="text-4xl mb-2">
                    {matchOver ? "🏆" : game.winner === 0 ? "🤝" : "✨"}
                  </div>
                  <h2 className="text-2xl font-bold text-gold-gradient font-display">
                    {matchOver
                      ? scores[0] === scores[1]
                        ? t.matchDraw
                        : t.matchWon(playerName(scores[0] > scores[1] ? 1 : 2))
                      : game.winner === 0
                        ? t.matchDraw
                        : `${playerName(game.winner)} wins Round ${round}!`}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {
                      {
                        stones: "Opponent has fewer than 3 stones.",
                        blocked: "Opponent has no legal moves.",
                        timeout: "Turn timer expired.",
                        draw: "Too many moves without a capture.",
                      }[game.endReason ?? "draw"]
                    }
                  </p>
                  <div className="my-4 font-display text-2xl font-bold text-primary flex items-center justify-center gap-3 bg-muted/40 py-2 rounded-xl">
                    <span>
                      {playerName(1)}: {scores[0]}
                    </span>
                    <span>—</span>
                    <span>
                      {playerName(2)}: {scores[1]}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    {matchOver ? (
                      <>
                        <Button size="lg" onClick={startMatch} className="w-full">
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {t.newMatch}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setPlaying(false)}
                          className="w-full"
                        >
                          {t.backToLobby}
                        </Button>
                      </>
                    ) : (
                      <Button size="lg" onClick={nextRound} className="w-full">
                        <Play className="mr-2 h-4 w-4" />
                        {t.nextRound}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
        {dialogs}
      </div>
    );
  }

  // Lobby & Multi-Tab Views (Play, Dashboard, Online, Friends, Settings, Rules)
  return (
    <div
      className={`theme-${settings.boardTheme} flex min-h-[100dvh] flex-col items-center bg-gradient-to-b from-[#18110c] to-[#0c0806]`}
    >
      {header}

      <main className="w-full max-w-3xl space-y-6 px-4 pt-4 pb-28">

        {/* TAB 1: PLAY SETUP */}
        {activeTab === "play" && (
          <section className="space-y-6 animate-in fade-in duration-300">
            {/* Quick Career Stats Bar */}
            <div className="panel grid grid-cols-4 gap-2 p-4 text-center shadow-md">
              <div>
                <div className="font-display text-2xl font-bold text-emerald-400">{stats.wins}</div>
                <div className="text-xs text-muted-foreground">{t.wins}</div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-rose-400">{stats.losses}</div>
                <div className="text-xs text-muted-foreground">{t.losses}</div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-amber-400">{stats.draws}</div>
                <div className="text-xs text-muted-foreground">{t.draws}</div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-primary">
                  {stats.total > 0 ? `${Math.round((stats.wins / stats.total) * 100)}%` : "0%"}
                </div>
                <div className="text-xs text-muted-foreground">{t.winRate}</div>
              </div>
            </div>

            {/* Match Setup Card */}
            <div className="panel space-y-5 p-6 shadow-xl">
              <div className="flex items-center justify-between pb-2 border-b border-border/40">
                <h2 className="text-xl font-bold font-display">{t.startMatch}</h2>
                <div className="text-xs text-muted-foreground">Custom Game Setup</div>
              </div>

              {/* Mode Selection */}
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.gameModes}
                </Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={settings.mode === "ai" ? "default" : "outline"}
                    onClick={() => {
                      sfx("click");
                      setSettings((s) => ({
                        ...s,
                        mode: "ai",
                        names: [s.names[0], "Computer"],
                      }));
                    }}
                    className="h-11 font-medium"
                  >
                    <Gamepad2 className="mr-2 h-4 w-4" />
                    {t.vsAi}
                  </Button>
                  <Button
                    type="button"
                    variant={settings.mode === "local" ? "default" : "outline"}
                    onClick={() => {
                      sfx("click");
                      setSettings((s) => ({
                        ...s,
                        mode: "local",
                        names: [s.names[0], "Player 2"],
                      }));
                    }}
                    className="h-11 font-medium"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    {t.passAndPlay}
                  </Button>
                </div>
              </div>

              {/* Toughness / Difficulty (when vs Computer) */}
              {settings.mode === "ai" && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t.difficulty}
                  </Label>
                  <div className="mt-1.5 grid grid-cols-4 gap-2">
                    {(
                      [
                        ["easy", t.easy],
                        ["normal", t.normal],
                        ["hard", t.hard],
                        ["master", t.master],
                      ] as const
                    ).map(([d, label]) => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={settings.difficulty === d ? "default" : "outline"}
                        onClick={() => {
                          sfx("click");
                          setSettings((s) => ({ ...s, difficulty: d }));
                        }}
                        className="font-medium"
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rounds Selection */}
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.rounds}
                </Label>
                <div className="mt-1.5 grid grid-cols-4 gap-2">
                  {([1, 3, 5, 7] as const).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={settings.rounds === r ? "default" : "outline"}
                      onClick={() => {
                        sfx("click");
                        setSettings((s) => ({ ...s, rounds: r }));
                      }}
                      className="font-medium"
                    >
                      {t.roundCount(r)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Move Timer Selection */}
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.timer}
                </Label>
                <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                  {(
                    [
                      [0, t.noLimit],
                      [30, "30s"],
                      [60, "1m"],
                      [180, "3m"],
                      [300, "5m"],
                    ] as const
                  ).map(([tm, label]) => (
                    <Button
                      key={tm}
                      type="button"
                      size="sm"
                      variant={settings.timer === tm ? "default" : "outline"}
                      onClick={() => {
                        sfx("click");
                        setSettings((s) => ({ ...s, timer: tm }));
                      }}
                      className="text-xs font-medium px-1"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Board Style Theme Selection */}
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t.boardTheme}
                </Label>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      ["wood", t.themeWood],
                      ["midnight", t.themeMidnight],
                      ["jade", t.themeJade],
                      ["ivory", t.themeIvory],
                    ] as const
                  ).map(([themeKey, label]) => (
                    <Button
                      key={themeKey}
                      type="button"
                      size="sm"
                      variant={settings.boardTheme === themeKey ? "default" : "outline"}
                      onClick={() => {
                        sfx("click");
                        setSettings((s) => ({ ...s, boardTheme: themeKey }));
                      }}
                      className="text-xs font-medium"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Players Customization (Avatars & Colors) */}
              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                {([1, 2] as Player[]).map((p) => (
                  <div
                    key={p}
                    className="space-y-3 rounded-xl border border-border/50 p-4 bg-muted/20"
                  >
                    <div className="flex items-center justify-between">
                      <Label htmlFor={`p-name-${p}`} className="font-semibold text-sm">
                        Player {p}
                      </Label>
                      <span className="text-2xl">{settings.avatars[p - 1]}</span>
                    </div>

                    <Input
                      id={`p-name-${p}`}
                      maxLength={20}
                      value={settings.names[p - 1]}
                      disabled={p === 2 && settings.mode === "ai"}
                      onChange={(e) => {
                        const newNames = [...settings.names] as [string, string];
                        newNames[p - 1] = e.target.value;
                        setSettings((s) => ({ ...s, names: newNames }));
                      }}
                      placeholder={`Player ${p} Name`}
                    />

                    {/* Avatar picker grid */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t.chooseAvatar}</div>
                      <div className="flex flex-wrap gap-1">
                        {AVATARS.map((av) => (
                          <button
                            key={av}
                            type="button"
                            onClick={() => {
                              sfx("click");
                              const newAv = [...settings.avatars] as [string, string];
                              newAv[p - 1] = av;
                              setSettings((s) => ({ ...s, avatars: newAv }));
                            }}
                            className={`h-9 w-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                              settings.avatars[p - 1] === av
                                ? "bg-primary/30 ring-2 ring-primary scale-110"
                                : "hover:bg-accent"
                            }`}
                          >
                            {av}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stone Color Picker */}
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">{t.stoneColors}</div>
                      <div className="flex flex-wrap gap-2">
                        {STONE_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={c}
                            onClick={() => {
                              sfx("click");
                              const newColors = [...settings.colors] as [string, string];
                              newColors[p - 1] = c;
                              setSettings((s) => ({ ...s, colors: newColors }));
                            }}
                            className={`h-8 w-8 rounded-full shadow-stone transition-all ${
                              settings.colors[p - 1] === c
                                ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110"
                                : "hover:scale-105"
                            }`}
                            style={{ background: stoneBg(c) }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Start Match Big Action Button */}
              <Button
                size="lg"
                className="w-full text-base font-bold py-6 shadow-xl"
                onClick={startMatch}
                disabled={!profileLoaded}
              >
                <Swords className="mr-2 h-5 w-5" />
                {profileLoaded ? t.startMatch : "Loading..."}
              </Button>
            </div>
          </section>
        )}

        {/* TAB 2: DASHBOARD */}
        {activeTab === "dashboard" && (
          <section className="space-y-6 animate-in fade-in duration-300">
            <div className="panel p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Trophy className="h-6 w-6 text-amber-400" />
                  <h2 className="text-xl font-bold font-display">{t.dashboard}</h2>
                </div>
                <div className="text-xs text-muted-foreground">{t.statistics}</div>
              </div>

              {/* Main Numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="panel p-4 text-center rounded-xl bg-muted/20 border border-border/40">
                  <div className="font-display text-3xl font-bold text-emerald-400">
                    {stats.wins}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">{t.wins}</div>
                </div>
                <div className="panel p-4 text-center rounded-xl bg-muted/20 border border-border/40">
                  <div className="font-display text-3xl font-bold text-rose-400">
                    {stats.losses}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">{t.losses}</div>
                </div>
                <div className="panel p-4 text-center rounded-xl bg-muted/20 border border-border/40">
                  <div className="font-display text-3xl font-bold text-amber-400">
                    {stats.draws}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">{t.draws}</div>
                </div>
                <div className="panel p-4 text-center rounded-xl bg-muted/20 border border-border/40">
                  <div className="font-display text-3xl font-bold text-primary">
                    {stats.total > 0 ? `${Math.round((stats.wins / stats.total) * 100)}%` : "0%"}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground mt-1">{t.winRate}</div>
                </div>
              </div>

              {/* Streak Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="panel p-4 flex items-center gap-3 rounded-xl bg-muted/20 border border-border/40">
                  <Flame className="h-8 w-8 text-orange-500 animate-pulse" />
                  <div>
                    <div className="font-display text-2xl font-bold">{stats.currentStreak}</div>
                    <div className="text-xs text-muted-foreground">{t.currentStreak}</div>
                  </div>
                </div>
                <div className="panel p-4 flex items-center gap-3 rounded-xl bg-muted/20 border border-border/40">
                  <Trophy className="h-8 w-8 text-amber-400" />
                  <div>
                    <div className="font-display text-2xl font-bold">{stats.bestStreak}</div>
                    <div className="text-xs text-muted-foreground">{t.bestStreak}</div>
                  </div>
                </div>
              </div>

              {/* Recent Match History */}
              <div className="space-y-3 pt-2">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <span>{t.history}</span>
                </h3>

                {historyList.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm panel bg-muted/10">
                    {t.noMatchesYet}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyList.map((m) => (
                      <div
                        key={m.id}
                        className="panel p-3.5 flex items-center justify-between rounded-xl hover:bg-accent/40 transition-all border border-border/40"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${
                              m.result === "win"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                : m.result === "loss"
                                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                                  : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                            }`}
                          >
                            {m.result}
                          </span>
                          <div>
                            <div className="font-semibold text-sm">{m.opponent}</div>
                            <div className="text-xs text-muted-foreground">{m.date}</div>
                          </div>
                        </div>
                        <div className="font-display text-lg font-bold text-primary">
                          {m.score[0]} – {m.score[1]}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* TAB 3: ONLINE MULTIPLAYER (ROOMS & LOBBY) */}
        {activeTab === "online" && (
          <section className="space-y-6 animate-in fade-in duration-300">
            <div className="panel p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Globe className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-bold font-display">{t.onlineMultiplayer}</h2>
                </div>
                <div className="text-xs text-muted-foreground">Play with friends anywhere</div>
              </div>

              {/* If player already created a room */}
              {currentRoom ? (
                <div className="space-y-4 rounded-xl border border-primary/40 p-5 bg-primary/5 text-center">
                  <div className="text-xs font-semibold text-primary uppercase tracking-widest">
                    {t.roomCode}
                  </div>
                  <div className="font-mono text-4xl font-extrabold tracking-widest text-primary my-2">
                    {currentRoom.code}
                  </div>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    {t.shareCodeHint}
                  </p>

                  <div className="flex justify-center gap-2 pt-2">
                    <Button variant="outline" onClick={handleCopyCode} className="h-10">
                      {copiedCode ? (
                        <Check className="mr-1.5 h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="mr-1.5 h-4 w-4" />
                      )}
                      {copiedCode ? "Copied" : "Copy Code"}
                    </Button>
                    <Button
                      onClick={() => {
                        sfx("click");
                        startMatch();
                      }}
                      className="h-10"
                    >
                      <Play className="mr-1.5 h-4 w-4" />
                      {currentRoom.guestId ? t.startMatch : "Play in Room"}
                    </Button>
                  </div>

                  <div className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                    <span>
                      {currentRoom.guestId
                        ? `Joined by ${currentRoom.guestName || "Opponent"}`
                        : t.waitingForPlayer}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Create Room */}
                  <div className="panel p-5 rounded-xl border border-border/60 bg-muted/10 space-y-3 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span>{t.createLobby}</span>
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Generate a 6-character room code and invite your friend to join your game.
                      </p>
                    </div>
                    <Button onClick={handleCreateRoom} className="w-full mt-4 font-semibold">
                      {t.createLobby}
                    </Button>
                  </div>

                  {/* Join Room */}
                  <div className="panel p-5 rounded-xl border border-border/60 bg-muted/10 space-y-3">
                    <h3 className="font-bold text-base flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <span>{t.joinLobby}</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Got a room code from a friend? Enter it below to join their lobby.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Input
                        placeholder={t.enterRoomCode}
                        value={joinCodeInput}
                        maxLength={6}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        className="font-mono text-center tracking-widest font-bold uppercase"
                      />
                      <Button onClick={handleJoinRoom} variant="default">
                        {t.join}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 4: PLAYER SEARCH & ONLINE LOBBY */}
        {activeTab === "friends" && (
          <section className="space-y-6 animate-in fade-in duration-300">
            <div className="panel p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-bold font-display">Player Lobby</h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full">
                  <span>{settings.avatars[0]}</span>
                  <span className="font-semibold text-foreground">
                    @{currentUsername || settings.names[0].toLowerCase().replace(/[^a-z0-9_]/g, "")}
                  </span>
                </div>
              </div>

              {/* Active Outgoing Invitation Status */}
              {outgoingInvitation && (
                <div className="panel p-4 rounded-xl border border-primary/50 bg-primary/10 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-3 text-center sm:text-left">
                    <span className="h-3 w-3 rounded-full bg-amber-400 animate-ping shrink-0" />
                    <div>
                      <div className="font-semibold text-sm">
                        Waiting for @{outgoingInvitation.toUser.username} to accept challenge...
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Room Code:{" "}
                        <span className="font-mono font-bold text-primary">
                          {outgoingInvitation.roomCode}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelOutgoingInvitation}
                    className="text-xs shrink-0"
                  >
                    Cancel Challenge
                  </Button>
                </div>
              )}

              {/* Incoming Real Game Invitations */}
              {incomingInvitations.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                      Incoming Game Invitations ({incomingInvitations.length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {incomingInvitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="panel p-4 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border-2 border-primary/40 bg-primary/5 shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{inv.fromAvatar}</span>
                          <div>
                            <div className="font-bold text-sm flex items-center gap-2">
                              <span>{inv.fromDisplayName}</span>
                              <span className="text-xs font-mono text-muted-foreground">
                                @{inv.fromUsername}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Challenged you to play in Room{" "}
                              <span className="font-mono font-semibold text-primary">
                                {inv.roomCode}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeclineInvitation(inv)}
                            className="text-xs"
                          >
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAcceptInvitation(inv)}
                            className="text-xs font-bold"
                          >
                            <Swords className="mr-1.5 h-3.5 w-3.5" />
                            Accept & Play
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Registered Players by Username from Supabase */}
              <div className="space-y-3">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <Search className="h-4 w-4 text-primary" />
                    <span>Find Registered Players</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Search registered users by username directly from the Supabase database.
                  </p>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search player username (e.g. anushka, player1)..."
                    value={playerSearchInput}
                    onChange={(e) => handleSearchPlayers(e.target.value)}
                    className="pl-9 pr-9 h-11 text-sm font-medium"
                  />
                  {isSearching && (
                    <RefreshCw className="absolute right-3 top-3 h-4 w-4 text-primary animate-spin" />
                  )}
                </div>

                {/* Search Results */}
                {searchedPlayers.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Players Found ({searchedPlayers.length})
                    </div>
                    {searchedPlayers.map((player) => (
                      <div
                        key={player.userId}
                        className="panel p-3.5 flex items-center justify-between rounded-xl border border-border/50 hover:bg-accent/40 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{player.avatar}</span>
                          <div>
                            <div className="font-bold text-sm flex items-center gap-2">
                              <span>{player.displayName}</span>
                              <span className="text-xs font-mono font-medium text-primary">
                                @{player.username}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">Registered Player</div>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => handleInvitePlayer(player)}
                          disabled={outgoingInvitation?.toUser.userId === player.userId}
                          className="font-medium"
                        >
                          <Swords className="mr-1.5 h-3.5 w-3.5" />
                          {outgoingInvitation?.toUser.userId === player.userId
                            ? "Invited"
                            : "Invite to Play"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : playerSearchInput.trim().length >= 2 && !isSearching ? (
                  <div className="text-center py-6 text-muted-foreground text-sm panel bg-muted/10 rounded-xl">
                    No registered players found matching &ldquo;{playerSearchInput}&rdquo;.
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground text-xs panel bg-muted/10 rounded-xl">
                    Type a username above to search registered players from Supabase.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* TAB 5: SETTINGS */}
        {activeTab === "settings" && (
          <section className="space-y-6 animate-in fade-in duration-300">
            <div className="panel p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <SettingsIcon className="h-6 w-6 text-primary" />
                  <h2 className="text-xl font-bold font-display">{t.settings}</h2>
                </div>
                <div className="text-xs text-muted-foreground">Preferences & Account</div>
              </div>

              {/* Display Name & Avatar */}
              <div className="space-y-4 rounded-xl border border-border/40 p-4 bg-muted/10">
                <h3 className="font-semibold text-sm">Player Profile</h3>
                <div>
                  <div className="text-xs text-muted-foreground">Unique Username</div>
                  <div className="font-mono text-sm font-semibold text-primary mt-0.5">
                    @{currentUsername || settings.names[0].toLowerCase().replace(/[^a-z0-9_]/g, "")}
                  </div>
                </div>

                <div>
                  <Label htmlFor="display-name-input" className="text-xs text-muted-foreground">
                    {t.displayName}
                  </Label>
                  <Input
                    id="display-name-input"
                    value={settings.names[0]}
                    onChange={(e) => {
                      const nn = [...settings.names] as [string, string];
                      nn[0] = e.target.value;
                      setSettings((s) => ({ ...s, names: nn }));
                    }}
                    maxLength={20}
                    className="mt-1"
                  />
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">{t.chooseAvatar}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {AVATARS.map((av) => (
                      <button
                        key={av}
                        type="button"
                        onClick={() => {
                          sfx("click");
                          const na = [...settings.avatars] as [string, string];
                          na[0] = av;
                          setSettings((s) => ({ ...s, avatars: na }));
                        }}
                        className={`h-10 w-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                          settings.avatars[0] === av
                            ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary scale-110"
                            : "hover:bg-accent"
                        }`}
                      >
                        {av}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Audio & Sound Settings */}
              <div className="space-y-4 rounded-xl border border-border/40 p-4 bg-muted/10">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <span>{t.soundEffects}</span>
                </h3>

                <div className="flex items-center justify-between">
                  <Label htmlFor="sound-toggle">{t.soundEffects}</Label>
                  <Switch
                    id="sound-toggle"
                    checked={settings.sound}
                    onCheckedChange={(checked) => {
                      setSettings((s) => ({ ...s, sound: checked }));
                      if (checked) playTone("click");
                    }}
                  />
                </div>

                {settings.sound && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t.volume}</span>
                      <span>{Math.round(settings.volume * 100)}%</span>
                    </div>
                    <Slider
                      value={[settings.volume * 100]}
                      min={10}
                      max={100}
                      step={5}
                      onValueChange={([val]) => {
                        const v = (val || 50) / 100;
                        setSettings((s) => ({ ...s, volume: v }));
                        setSoundVolume(v);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Theme & Display Mode */}
              <div className="space-y-4 rounded-xl border border-border/40 p-4 bg-muted/10">
                <h3 className="font-semibold text-sm">{t.themeMode}</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={settings.themeMode === "dark" ? "default" : "outline"}
                    onClick={() => {
                      sfx("click");
                      setSettings((s) => ({ ...s, themeMode: "dark" }));
                    }}
                    className="font-medium"
                  >
                    <Moon className="mr-2 h-4 w-4" />
                    {t.darkMode}
                  </Button>
                  <Button
                    type="button"
                    variant={settings.themeMode === "light" ? "default" : "outline"}
                    onClick={() => {
                      sfx("click");
                      setSettings((s) => ({ ...s, themeMode: "light" }));
                    }}
                    className="font-medium"
                  >
                    <Sun className="mr-2 h-4 w-4" />
                    {t.lightMode}
                  </Button>
                </div>
              </div>

              {/* Change Password Form */}
              <form
                onSubmit={handlePasswordUpdate}
                className="space-y-3 rounded-xl border border-border/40 p-4 bg-muted/10"
              >
                <h3 className="font-semibold text-sm">{t.changePassword}</h3>
                <div>
                  <Label htmlFor="new-pw" className="text-xs text-muted-foreground">
                    {t.newPassword}
                  </Label>
                  <Input
                    id="new-pw"
                    type="password"
                    value={passwordState.newPassword}
                    onChange={(e) =>
                      setPasswordState((p) => ({ ...p, newPassword: e.target.value }))
                    }
                    placeholder="At least 6 characters"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="conf-pw" className="text-xs text-muted-foreground">
                    {t.confirmPassword}
                  </Label>
                  <Input
                    id="conf-pw"
                    type="password"
                    value={passwordState.confirmPassword}
                    onChange={(e) =>
                      setPasswordState((p) => ({ ...p, confirmPassword: e.target.value }))
                    }
                    placeholder="Repeat new password"
                    className="mt-1"
                  />
                </div>
                <Button type="submit" disabled={passwordState.updating} className="w-full">
                  {passwordState.updating ? "Updating..." : t.updatePassword}
                </Button>
              </form>

              {/* Save Preferences Button */}
              <Button size="lg" onClick={() => savePrefs(settings)} className="w-full font-bold">
                {t.savePreferences}
              </Button>
            </div>
          </section>
        )}

        {/* TAB 6: RULES & HOW TO PLAY */}
        {activeTab === "rules" && (
          <section className="space-y-6 animate-in fade-in duration-300">
            <div className="panel p-6 shadow-xl space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-border/40">
                <BookOpen className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-bold font-display">{t.rules}</h2>
              </div>

              <div className="space-y-4 text-sm leading-relaxed">
                <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                  <h4 className="font-bold text-primary mb-1">🎮 Objective of Varasaata</h4>
                  <p className="text-muted-foreground">
                    Varasaata (also known as Nine Men's Morris or Navakankari) is a classical stone
                    strategy game. Each player controls 9 stones. The goal is to leave your opponent
                    with fewer than 3 stones or no legal moves.
                  </p>
                </div>

                <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                  <h4 className="font-bold text-primary mb-1">1️⃣ Phase 1: Stone Placement</h4>
                  <p className="text-muted-foreground">
                    Players take turns placing their 9 stones one by one on any vacant intersection
                    point on the board.
                  </p>
                </div>

                <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                  <h4 className="font-bold text-primary mb-1">2️⃣ Forming a Mill &amp; Captures</h4>
                  <p className="text-muted-foreground">
                    Whenever you align 3 of your stones along a straight line, you form a{" "}
                    <strong>MILL (వరుస / कतार)</strong>. Forming a mill lets you immediately capture
                    and permanently remove any one opponent stone from the board. Stones inside an
                    active mill are protected and cannot be captured unless all opposing stones are
                    in mills.
                  </p>
                </div>

                <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                  <h4 className="font-bold text-primary mb-1">3️⃣ Phase 2: Sliding Movement</h4>
                  <p className="text-muted-foreground">
                    Once all 9 stones are on the board, players take turns moving one stone along
                    the board lines to an adjacent empty spot.
                  </p>
                </div>

                <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                  <h4 className="font-bold text-primary mb-1">🏆 Winning the Match</h4>
                  <p className="text-muted-foreground">
                    You win when the opponent has fewer than 3 stones left, has no legal moves
                    remaining, or runs out of move time.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <LegalLinks />
      </main>
      {navTabs}
      {dialogs}
    </div>
  );
}
