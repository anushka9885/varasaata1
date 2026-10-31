import { describe, it, expect, beforeEach } from "vitest";
import {
  generateRoomCode,
  searchRegisteredPlayers,
  sendGameInvitation,
  getIncomingInvitations,
  respondToInvitation,
} from "./online";

describe("Online Lobby & Real Invitations", () => {
  it("generates a 6-character alphanumeric room code", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("gracefully returns empty array for blank or single-character search queries", async () => {
    const resEmpty = await searchRegisteredPlayers("", "usr_current");
    expect(resEmpty).toEqual([]);

    const resSingle = await searchRegisteredPlayers("a", "usr_current");
    expect(resSingle).toEqual([]);
  });

  it("creates a game invitation and allows recipient to accept or decline", async () => {
    const hostUser = { id: "usr_host_123", name: "HostPlayer", avatar: "🦚" };
    const guestUserId = "usr_guest_456";

    const inviteRes = await sendGameInvitation(hostUser, guestUserId, {
      hostColor: "emerald",
      guestColor: "ruby",
      timer: 60,
      rounds: 3,
    });

    expect(inviteRes.success).toBe(true);
    expect(inviteRes.room?.code).toHaveLength(6);
    expect(inviteRes.room?.hostId).toBe(hostUser.id);

    // Recipient declines
    const declineRes = await respondToInvitation("inv_dummy", false, {
      id: guestUserId,
      name: "GuestPlayer",
      avatar: "🐅",
    });
    expect(declineRes.success).toBe(true);
  });
});
