/**
 * Robust mock/fallback client for Supabase Auth and Database
 * Operates offline or when Supabase keys are missing.
 * Persists to localStorage and synchronizes across tabs via BroadcastChannel.
 */

export interface MockUser {
  id: string;
  email: string;
  user_metadata: {
    display_name?: string;
    avatar?: string;
    [key: string]: unknown;
  };
}

export interface MockSession {
  user: MockUser;
  access_token: string;
  token_type: string;
  expires_in: number;
}

export type TableRow = Record<string, unknown>;

const STORAGE_KEY_SESSION = "varasaata_session_v1";
const STORAGE_KEY_USERS = "varasaata_users_v1";
const STORAGE_KEY_TABLES = "varasaata_tables_v1";

type AuthListener = (
  event: "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED",
  session: MockSession | null,
) => void;
const authListeners = new Set<AuthListener>();

function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, val: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, val);
  } catch {
    // quota exceeded or private mode
  }
}

// Initial demo users and tables seeding
function getTableData(table: string): TableRow[] {
  try {
    const raw = safeGetItem(`${STORAGE_KEY_TABLES}_${table}`);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore parse errors */
  }
  return [];
}

function setTableData(table: string, rows: TableRow[]): void {
  safeSetItem(`${STORAGE_KEY_TABLES}_${table}`, JSON.stringify(rows));
  notifyCrossTab("table_update", { table, rows });
}

// Cross-tab broadcast
const channel =
  typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel("varasaata_sync")
    : null;

function notifyCrossTab(type: string, payload: unknown) {
  try {
    channel?.postMessage({ type, payload });
  } catch {
    /* channel send failure */
  }
}

export function subscribeToCrossTab(cb: (type: string, payload: Record<string, unknown>) => void) {
  if (!channel) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data?.type) cb(e.data.type, e.data.payload);
  };
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}

export function broadcastLobbyEvent(action: string, payload: unknown) {
  notifyCrossTab("lobby_event", { action, payload });
}

// Mock Supabase Auth
export const mockAuth = {
  async getSession(): Promise<{ data: { session: MockSession | null }; error: null }> {
    const raw = safeGetItem(STORAGE_KEY_SESSION);
    if (!raw) return { data: { session: null }, error: null };
    try {
      const session = JSON.parse(raw) as MockSession;
      return { data: { session }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },

  async getUser(): Promise<{ data: { user: MockUser | null }; error: null }> {
    const res = await this.getSession();
    return { data: { user: res.data.session?.user ?? null }, error: null };
  },

  async signInWithPassword({ email, password }: { email: string; password?: string }): Promise<{
    data: { user: MockUser | null; session: MockSession | null };
    error: Error | null;
  }> {
    const norm = email.trim().toLowerCase();
    const usersRaw = safeGetItem(STORAGE_KEY_USERS);
    const users: Record<string, { user: MockUser; passwordHash: string }> = usersRaw
      ? JSON.parse(usersRaw)
      : {};

    let record = users[norm];
    if (!record) {
      // Auto-create or login with entered credentials for frictionless AI Studio experience
      const id = "usr_" + Math.random().toString(36).substring(2, 9);
      const name = norm.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") || "Player";
      const newUser: MockUser = {
        id,
        email: norm,
        user_metadata: { display_name: name, avatar: "🦚" },
      };
      record = { user: newUser, passwordHash: password || "password" };
      users[norm] = record;
      safeSetItem(STORAGE_KEY_USERS, JSON.stringify(users));

      // Also ensure profile exists
      const profiles = getTableData("profiles");
      if (!profiles.some((p) => p.user_id === id)) {
        profiles.push({
          user_id: id,
          display_name: name,
          avatar: "🦚",
          p1_color: "emerald",
          p2_color: "ruby",
          board_theme: "wood",
          sound_enabled: true,
          language: "en",
          theme_mode: "dark",
        });
        setTableData("profiles", profiles);
      }
    }

    const session: MockSession = {
      user: record.user,
      access_token: "mock-token-" + Date.now(),
      token_type: "bearer",
      expires_in: 86400,
    };
    safeSetItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    authListeners.forEach((l) => l("SIGNED_IN", session));
    return { data: { user: record.user, session }, error: null };
  },

  async signUp({
    email,
    password,
    options,
  }: {
    email: string;
    password?: string;
    options?: { data?: Record<string, unknown> };
  }): Promise<{
    data: { user: MockUser | null; session: MockSession | null };
    error: Error | null;
  }> {
    const norm = email.trim().toLowerCase();
    const usersRaw = safeGetItem(STORAGE_KEY_USERS);
    const users: Record<string, { user: MockUser; passwordHash: string }> = usersRaw
      ? JSON.parse(usersRaw)
      : {};

    const id = "usr_" + Math.random().toString(36).substring(2, 9);
    const displayName = (options?.data?.display_name as string) || norm.split("@")[0] || "Player";
    const avatar = (options?.data?.avatar as string) || "🦚";

    const newUser: MockUser = {
      id,
      email: norm,
      user_metadata: { display_name: displayName, avatar },
    };

    users[norm] = { user: newUser, passwordHash: password || "" };
    safeSetItem(STORAGE_KEY_USERS, JSON.stringify(users));

    // Seed profile row
    const profiles = getTableData("profiles");
    profiles.push({
      user_id: id,
      display_name: displayName,
      avatar,
      p1_color: "emerald",
      p2_color: "ruby",
      board_theme: "wood",
      sound_enabled: true,
      language: "en",
      theme_mode: "dark",
    });
    setTableData("profiles", profiles);

    // Seed policy consent automatically
    const consents = getTableData("policy_consents");
    consents.push({
      user_id: id,
      privacy_policy_version: "2026-10-19",
      terms_version: "2026-10-16",
      consent_source: "web",
    });
    setTableData("policy_consents", consents);

    const session: MockSession = {
      user: newUser,
      access_token: "mock-token-" + Date.now(),
      token_type: "bearer",
      expires_in: 86400,
    };
    safeSetItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    authListeners.forEach((l) => l("SIGNED_IN", session));
    return { data: { user: newUser, session }, error: null };
  },

  async signOut(): Promise<{ error: null }> {
    safeSetItem(STORAGE_KEY_SESSION, "");
    authListeners.forEach((l) => l("SIGNED_OUT", null));
    return { error: null };
  },

  async updateUser({
    password,
    data,
  }: {
    password?: string;
    data?: Record<string, unknown>;
  }): Promise<{ data: { user: MockUser }; error: null }> {
    const curr = await this.getSession();
    if (!curr.data.session) throw new Error("No active session");
    const user = curr.data.session.user;

    if (data) {
      user.user_metadata = { ...user.user_metadata, ...data };
    }

    const usersRaw = safeGetItem(STORAGE_KEY_USERS);
    const users: Record<string, { user: MockUser; passwordHash: string }> = usersRaw
      ? JSON.parse(usersRaw)
      : {};
    if (users[user.email]) {
      if (password) users[user.email].passwordHash = password;
      users[user.email].user = user;
      safeSetItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }

    curr.data.session.user = user;
    safeSetItem(STORAGE_KEY_SESSION, JSON.stringify(curr.data.session));
    authListeners.forEach((l) => l("USER_UPDATED", curr.data.session));
    return { data: { user }, error: null };
  },

  async resetPasswordForEmail(
    _email: string,
    _opts?: { redirectTo?: string },
  ): Promise<{ data: Record<string, unknown>; error: null }> {
    return { data: {}, error: null };
  },

  onAuthStateChange(callback: AuthListener) {
    authListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => authListeners.delete(callback),
        },
      },
    };
  },
};

// Mock Query Builder
class MockQueryBuilder {
  private table: string;
  private filters: Array<(row: TableRow) => boolean> = [];
  private orderCol?: string;
  private ascending: boolean = true;
  private limitNum?: number;

  constructor(table: string) {
    this.table = table;
  }

  select(_cols: string = "*") {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  ilike(column: string, pattern: string) {
    const search = pattern.replace(/%/g, "").toLowerCase();
    this.filters.push((row) =>
      String(row[column] || "")
        .toLowerCase()
        .includes(search),
    );
    return this;
  }

  or(expr: string) {
    const parts = expr.split(",");
    this.filters.push((row) => {
      return parts.some((p) => {
        const segs = p.split(".");
        const col = segs[0];
        const op = segs[1];
        const val = segs.slice(2).join(".");
        if (op === "ilike") {
          const s = val.replace(/%/g, "").toLowerCase();
          return String(row[col] || "")
            .toLowerCase()
            .includes(s);
        }
        if (op === "eq") return String(row[col]) === val;
        return false;
      });
    });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderCol = column;
    this.ascending = opts?.ascending ?? true;
    return this;
  }

  limit(n: number) {
    this.limitNum = n;
    return this;
  }

  async maybeSingle() {
    const rows = getTableData(this.table).filter((r) => this.filters.every((f) => f(r)));
    return { data: rows[0] || null, error: null };
  }

  async single() {
    const rows = getTableData(this.table).filter((r) => this.filters.every((f) => f(r)));
    return { data: rows[0] || null, error: rows.length ? null : new Error("Row not found") };
  }

  then(onfulfilled?: (value: { data: TableRow[]; error: null }) => unknown) {
    let rows = getTableData(this.table).filter((r) => this.filters.every((f) => f(r)));
    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) => {
        const valA = a[col] as string | number;
        const valB = b[col] as string | number;
        if (valA < valB) return this.ascending ? -1 : 1;
        if (valA > valB) return this.ascending ? 1 : -1;
        return 0;
      });
    }
    if (this.limitNum !== undefined) {
      rows = rows.slice(0, this.limitNum);
    }
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
  }

  async insert(items: TableRow | TableRow[]) {
    const toInsert = Array.isArray(items) ? items : [items];
    const current = getTableData(this.table);
    for (const item of toInsert) {
      if (!item.id && !item.user_id) item.id = "row_" + Math.random().toString(36).substring(2, 9);
      if (!item.created_at) item.created_at = new Date().toISOString();
      current.push(item);
    }
    setTableData(this.table, current);
    return { data: toInsert, error: null };
  }

  async upsert(item: TableRow, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    const current = getTableData(this.table);
    const conflicts = (opts?.onConflict || "id").split(",").map((s) => s.trim());
    const idx = current.findIndex((r) => conflicts.every((c) => r[c] === item[c]));

    if (idx >= 0) {
      if (!opts?.ignoreDuplicates) {
        current[idx] = { ...current[idx], ...item };
      }
    } else {
      if (!item.id) item.id = "row_" + Math.random().toString(36).substring(2, 9);
      if (!item.created_at) item.created_at = new Date().toISOString();
      current.push(item);
    }
    setTableData(this.table, current);
    return { data: item, error: null };
  }

  async update(patch: TableRow) {
    const current = getTableData(this.table);
    let updatedCount = 0;
    const next = current.map((row) => {
      if (this.filters.every((f) => f(row))) {
        updatedCount++;
        return { ...row, ...patch };
      }
      return row;
    });
    setTableData(this.table, next);
    return { data: patch, count: updatedCount, error: null };
  }

  async delete() {
    const current = getTableData(this.table);
    const next = current.filter((row) => !this.filters.every((f) => f(row)));
    setTableData(this.table, next);
    return { data: null, error: null };
  }
}

export const mockDatabase = {
  from(table: string) {
    return new MockQueryBuilder(table);
  },
};
