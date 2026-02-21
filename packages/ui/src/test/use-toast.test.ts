import { describe, expect, it, vi } from "vitest";
import { reducer, toast } from "../ui/use-toast";

describe("use-toast", () => {
  it("adds and dismisses toast entries", () => {
    const state = reducer(
      { toasts: [] },
      {
        type: "ADD_TOAST",
        toast: {
          id: "1",
          open: true,
          title: "Hello",
        },
      }
    );

    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].title).toBe("Hello");
  });

  it("returns a dismiss handler for imperative toast API", () => {
    const result = toast({ title: "Saved" });
    expect(result.id).toBeTruthy();
    expect(typeof result.dismiss).toBe("function");
  });
});
