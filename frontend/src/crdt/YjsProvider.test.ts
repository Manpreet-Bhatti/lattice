import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as Y from "yjs";
import { LatticeProvider, Awareness } from "./YjsProvider";

describe("LatticeProvider", () => {
  let doc: Y.Doc;
  let provider: LatticeProvider;

  beforeEach(() => {
    doc = new Y.Doc();
    // Use a non-existent URL to test without actual connection
    provider = new LatticeProvider("ws://localhost:9999/ws", "test-room", doc);
  });

  afterEach(() => {
    provider.destroy();
    doc.destroy();
  });

  it("should create provider with correct room ID", () => {
    expect(provider.roomId).toBe("test-room");
  });

  it("should use provided Y.Doc", () => {
    expect(provider.doc).toBe(doc);
  });

  it("should have awareness instance", () => {
    expect(provider.awareness).toBeInstanceOf(Awareness);
  });

  it("should emit synced event when synced", async () => {
    const syncedCallback = vi.fn();
    provider.on("synced", syncedCallback);

    // Manually trigger sync for testing
    provider.emit("synced", [true]);

    expect(syncedCallback).toHaveBeenCalledWith(true);
  });

  it("should handle connection status events", () => {
    const statusCallback = vi.fn();
    provider.on("status", statusCallback);

    provider.emit("status", [{ status: "connected" }]);

    expect(statusCallback).toHaveBeenCalledWith({ status: "connected" });
  });

  it("should clean up on destroy", () => {
    const disconnectSpy = vi.spyOn(provider, "disconnect");
    provider.destroy();
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it("should report connection status", () => {
    // Initial status should be connecting or disconnected
    expect(["connecting", "disconnected"]).toContain(provider.connectionStatus);
  });
});

describe("Awareness", () => {
  let doc: Y.Doc;
  let awareness: Awareness;

  beforeEach(() => {
    doc = new Y.Doc();
    awareness = new Awareness(doc);
  });

  afterEach(() => {
    awareness.destroy();
    doc.destroy();
  });

  it("should have a unique clientID", () => {
    expect(awareness.clientID).toBe(doc.clientID);
  });

  it("should set and get local state", () => {
    awareness.setLocalState({
      user: { name: "Test User", color: "#ff0000" },
    });

    const state = awareness.getLocalState();
    expect(state?.user?.name).toBe("Test User");
    expect(state?.user?.color).toBe("#ff0000");
  });

  it("should set local state field", () => {
    awareness.setLocalState({
      user: { name: "Test User", color: "#ff0000" },
    });

    awareness.setLocalStateField("cursor", { anchor: 10, head: 10 });

    const state = awareness.getLocalState();
    expect(state?.cursor?.anchor).toBe(10);
    expect(state?.user?.name).toBe("Test User"); // Original field preserved
  });

  it("should return all states", () => {
    awareness.setLocalState({
      user: { name: "Test User", color: "#ff0000" },
    });

    const states = awareness.getStates();
    expect(states.size).toBe(1);
    expect(states.has(doc.clientID)).toBe(true);
  });

  it("should emit update event when state updates", () => {
    const updateCallback = vi.fn();
    awareness.on("update", updateCallback);

    awareness.setLocalState({
      user: { name: "New User", color: "#00ff00" },
    });

    expect(updateCallback).toHaveBeenCalled();
  });

  it("should handle null state", () => {
    awareness.setLocalState({
      user: { name: "Test User", color: "#ff0000" },
    });

    awareness.setLocalState(null);
    expect(awareness.getLocalState()).toBeNull();
  });

  it("should track isTyping state", () => {
    awareness.setLocalState({
      user: { name: "Test User", color: "#ff0000" },
    });

    awareness.setLocalStateField("isTyping", true);

    const state = awareness.getLocalState();
    expect(state?.isTyping).toBe(true);
  });
});

describe("Y.Doc Integration", () => {
  it("should sync text changes through Y.Doc", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const text1 = doc1.getText("content");
    const text2 = doc2.getText("content");

    // Simulate editing on doc1
    text1.insert(0, "Hello");

    // Get the update
    const update = Y.encodeStateAsUpdate(doc1);

    // Apply to doc2
    Y.applyUpdate(doc2, update);

    // Both should have the same content
    expect(text1.toString()).toBe("Hello");
    expect(text2.toString()).toBe("Hello");

    doc1.destroy();
    doc2.destroy();
  });

  it("should handle concurrent edits", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const text1 = doc1.getText("content");
    const text2 = doc2.getText("content");

    // Both docs start empty and edit concurrently
    text1.insert(0, "AAA");
    text2.insert(0, "BBB");

    // Exchange updates
    const update1 = Y.encodeStateAsUpdate(doc1);
    const update2 = Y.encodeStateAsUpdate(doc2);

    Y.applyUpdate(doc1, update2);
    Y.applyUpdate(doc2, update1);

    // Both docs should converge to the same state
    expect(text1.toString()).toBe(text2.toString());

    // Both strings should be present
    const result = text1.toString();
    expect(result.includes("AAA")).toBe(true);
    expect(result.includes("BBB")).toBe(true);

    doc1.destroy();
    doc2.destroy();
  });

  it("should maintain document identity across updates", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const text1 = doc1.getText("content");
    const text2 = doc2.getText("content");

    // Multiple sequential edits
    text1.insert(0, "First ");
    let update = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update);

    text1.insert(text1.length, "Second ");
    update = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update);

    text1.insert(text1.length, "Third");
    update = Y.encodeStateAsUpdate(doc1);
    Y.applyUpdate(doc2, update);

    expect(text1.toString()).toBe("First Second Third");
    expect(text2.toString()).toBe("First Second Third");

    doc1.destroy();
    doc2.destroy();
  });
});
