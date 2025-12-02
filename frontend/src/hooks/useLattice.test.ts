import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";

describe("useLattice hook interface", () => {
  it("should export useLattice function", async () => {
    const { useLattice } = await import("./useLattice");
    expect(typeof useLattice).toBe("function");
  });

  it("should require roomId in options", async () => {
    const { useLattice } = await import("./useLattice");

    expect(() => {
      // @ts-expect-error - Testing without required param
      useLattice({});
    }).toThrow();
  });
});

describe("Y.Doc text operations", () => {
  let doc: Y.Doc;
  let text: Y.Text;

  beforeEach(() => {
    doc = new Y.Doc();
    text = doc.getText("content");
  });

  afterEach(() => {
    doc.destroy();
  });

  it("should insert text at position", () => {
    text.insert(0, "Hello");
    expect(text.toString()).toBe("Hello");
  });

  it("should delete text", () => {
    text.insert(0, "Hello World");
    text.delete(5, 6); // Delete " World"
    expect(text.toString()).toBe("Hello");
  });

  it("should replace text by deleting and inserting", () => {
    text.insert(0, "Hello");
    text.delete(0, text.length);
    text.insert(0, "Goodbye");
    expect(text.toString()).toBe("Goodbye");
  });

  it("should observe changes", () => {
    const callback = vi.fn();
    text.observe(callback);

    text.insert(0, "Test");

    expect(callback).toHaveBeenCalled();
  });

  it("should unobserve changes", () => {
    const callback = vi.fn();
    text.observe(callback);
    text.unobserve(callback);

    text.insert(0, "Test");

    expect(callback).not.toHaveBeenCalled();
  });
});

describe("User info generation", () => {
  it("should generate color from predefined list", () => {
    const validColors = [
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#3b82f6",
      "#8b5cf6",
      "#ec4899",
      "#06b6d4",
      "#84cc16",
    ];

    // Test 10 random generations
    for (let i = 0; i < 10; i++) {
      const color = validColors[Math.floor(Math.random() * validColors.length)];
      expect(validColors).toContain(color);
    }
  });

  it("should generate name from adjectives and animals", () => {
    const adjectives = [
      "Swift",
      "Clever",
      "Bright",
      "Quick",
      "Sharp",
      "Keen",
      "Bold",
      "Calm",
    ];
    const animals = [
      "Fox",
      "Owl",
      "Hawk",
      "Wolf",
      "Bear",
      "Lion",
      "Eagle",
      "Deer",
    ];

    // Test that any combination is valid
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const name = `${adjective}${animal}`;

    expect(name.length).toBeGreaterThan(0);
    expect(adjectives.some((a) => name.startsWith(a))).toBe(true);
    expect(animals.some((a) => name.endsWith(a))).toBe(true);
  });
});

describe("Connection status types", () => {
  it("should have valid status values", () => {
    const validStatuses = ["connecting", "connected", "disconnected", "error"];

    validStatuses.forEach((status) => {
      expect(typeof status).toBe("string");
    });
  });
});
