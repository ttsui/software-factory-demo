import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/todo-api";
import { useTodos } from "@/hooks/use-todos";
import type { Todo } from "@/types/todo";

// The repository uses a Node test environment; model hook slots and effects
// without introducing a DOM dependency or mocking the HTTP client.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  cleanups: [] as (() => void)[],
}));

vi.mock("react", () => ({
  useState<T>(initial: T) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [
      hooks.slots[index] as T,
      (next: T | ((current: T) => T)) => {
        hooks.slots[index] = typeof next === "function"
          ? (next as (current: T) => T)(hooks.slots[index] as T)
          : next;
      },
    ];
  },
  useRef<T>(initial: T) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useCallback<T>(callback: T, dependencies: unknown[]) {
    const index = hooks.cursor++;
    const previous = hooks.slots[index] as { callback: T; dependencies: unknown[] } | undefined;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
      hooks.slots[index] = { callback, dependencies };
      return callback;
    }
    return previous.callback;
  },
  useEffect(effect: () => void | (() => void), dependencies: unknown[]) {
    const index = hooks.cursor++;
    const previous = hooks.slots[index] as unknown[] | undefined;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
      hooks.slots[index] = dependencies;
      hooks.effects.push(() => {
        const cleanup = effect();
        if (cleanup) hooks.cleanups.push(cleanup);
      });
    }
  },
}));

function render() {
  hooks.cursor = 0;
  const result = useTodos();
  hooks.effects.splice(0).forEach((effect) => effect());
  return result;
}

const fetchMock = vi.fn<typeof fetch>();
const active: Todo = {
  id: "1", title: "First", completed: false, createdAt: "2026-01-01T00:00:00Z",
};
const completed: Todo = {
  id: "2", title: "Second", completed: true, createdAt: "2026-01-02T00:00:00Z",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function mount(todos = [active, completed]) {
  fetchMock.mockResolvedValueOnce(json(todos));
  expect(render().isLoading).toBe(true);
  await vi.waitFor(() => expect(render().isLoading).toBe(false));
  return render();
}

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.cleanups = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  hooks.cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

describe("Todo HTTP client", () => {
  it("uses the typed endpoint methods, JSON bodies, and encoded item IDs", async () => {
    fetchMock
      .mockResolvedValueOnce(json([active]))
      .mockResolvedValueOnce(json(active, 201))
      .mockResolvedValueOnce(json(active))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json([completed]))
      .mockResolvedValueOnce(json({ deleted: 1 }));
    expect(await api.fetchTodos()).toEqual([active]);
    expect(await api.createTodo({ title: "First" })).toEqual(active);
    expect(await api.updateTodo("a/b ?", { completed: false })).toEqual(active);
    await api.deleteTodo("a/b ?");
    expect(await api.toggleAllTodos({ completed: true })).toEqual([completed]);
    await api.clearCompletedTodos();

    const requests = fetchMock.mock.calls.map(([path, options]) => ({
      path, method: options?.method, body: options?.body,
    }));
    expect(requests).toEqual([
      { path: "/api/todos", method: "GET", body: undefined },
      { path: "/api/todos", method: "POST", body: '{"title":"First"}' },
      { path: "/api/todos/a%2Fb%20%3F", method: "PATCH", body: '{"completed":false}' },
      { path: "/api/todos/a%2Fb%20%3F", method: "DELETE", body: undefined },
      { path: "/api/todos/toggle-all", method: "POST", body: '{"completed":true}' },
      { path: "/api/todos/completed", method: "DELETE", body: undefined },
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options?.headers).toEqual({ "Content-Type": "application/json" });
      expect(options?.cache).toBe("no-store");
    }
  });

  it.each([
    [{ error: "Title required" }, "Title required"],
    [{ error: { code: "INVALID_TITLE", message: "Invalid title" } }, "Invalid title"],
    [{ message: "Validation failed" }, "Validation failed"],
  ])("preserves structured HTTP errors (%j)", async (details, message) => {
    fetchMock.mockResolvedValueOnce(json(details, 400));
    await expect(api.createTodo({ title: "" })).rejects.toMatchObject({
      name: "TodoApiError", status: 400, message, details,
    });
  });

  it("handles non-JSON errors and network failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    await expect(api.fetchTodos()).rejects.toMatchObject({
      name: "TodoApiError", status: 503, message: "Todo API request failed (503)",
    });
    fetchMock.mockRejectedValueOnce(new TypeError("Offline"));
    await expect(api.fetchTodos()).rejects.toMatchObject({ status: 0, message: "Offline" });
  });

  it.each([{}, [null], [{ ...active, completed: "false" }], [active, active]])(
    "rejects malformed or duplicate Todo lists (%j)",
    async (body) => {
      fetchMock.mockResolvedValueOnce(json(body));
      await expect(api.fetchTodos()).rejects.toBeInstanceOf(api.TodoApiError);
    },
  );

  it("rejects malformed single-item and invalid JSON responses", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "1" }));
    await expect(api.createTodo({ title: "First" })).rejects.toBeInstanceOf(api.TodoApiError);
    fetchMock.mockResolvedValueOnce(new Response("not JSON"));
    await expect(api.fetchTodos()).rejects.toBeInstanceOf(api.TodoApiError);
  });

  it("reloads the authoritative list when bulk toggling returns a summary", async () => {
    fetchMock.mockResolvedValueOnce(json({ updated: 1 })).mockResolvedValueOnce(json([completed]));
    expect(await api.toggleAllTodos({ completed: true })).toEqual([completed]);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/todos");
  });
});

describe("useTodos state reconciliation", () => {
  it("loads todos and computes active and completed counts", async () => {
    const state = await mount();
    expect(state.todos).toEqual([active, completed]);
    expect(state.activeCount).toBe(1);
    expect(state.completedCount).toBe(1);
    expect(state.error).toBeNull();
  });

  it("reconciles every action using server data and only removes confirmed deletions", async () => {
    await mount();
    const created = { ...active, id: "3", title: "Trimmed by server" };
    fetchMock.mockResolvedValueOnce(json(created, 201));
    expect(await render().createTodo({ title: "  Trimmed by server  " })).toEqual(created);
    expect(render().todos).toEqual([active, completed, created]);

    const updated = { ...active, title: "Server title", completed: true };
    fetchMock.mockResolvedValueOnce(json(updated));
    await render().updateTodo(active.id, { title: " Server title ", completed: true });
    expect(render().todos).toEqual([updated, completed, created]);
    expect(render().completedCount).toBe(2);

    const toggled = [updated, completed, { ...created, completed: true }];
    fetchMock.mockResolvedValueOnce(json(toggled));
    await render().toggleAllTodos({ completed: true });
    expect(render().todos).toEqual(toggled);
    expect(render().activeCount).toBe(0);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await render().deleteTodo(completed.id);
    expect(render().todos).toEqual([updated, toggled[2]]);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await render().clearCompletedTodos();
    expect(render().todos).toEqual([]);
  });

  it("clears completed todos without removing active todos", async () => {
    await mount();
    fetchMock.mockResolvedValueOnce(json({ deleted: 1 }));
    await render().clearCompletedTodos();
    expect(render().todos).toEqual([active]);
    expect(render().completedCount).toBe(0);
  });

  it.each([
    (state: ReturnType<typeof useTodos>) => state.createTodo({ title: "New" }),
    (state: ReturnType<typeof useTodos>) => state.updateTodo(active.id, { completed: true }),
    (state: ReturnType<typeof useTodos>) => state.deleteTodo(active.id),
    (state: ReturnType<typeof useTodos>) => state.toggleAllTodos({ completed: true }),
    (state: ReturnType<typeof useTodos>) => state.clearCompletedTodos(),
    (state: ReturnType<typeof useTodos>) => state.loadTodos(),
  ])("preserves confirmed state when an action fails (%#)", async (action) => {
    await mount();
    fetchMock.mockResolvedValueOnce(json({ error: "Storage unavailable" }, 500));
    expect(await action(render())).toBeUndefined();
    expect(render().todos).toEqual([active, completed]);
    expect(render().activeCount).toBe(1);
    expect(render().completedCount).toBe(1);
    expect(render().error).toMatchObject({ status: 500, message: "Storage unavailable" });
    expect(render().isLoading).toBe(false);
  });

  it("recovers from initial loading failure and clears the error on success", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Offline"));
    render();
    await vi.waitFor(() => expect(render().isLoading).toBe(false));
    expect(render().todos).toEqual([]);
    expect(render().error).toMatchObject({ status: 0, message: "Offline" });
    fetchMock.mockResolvedValueOnce(json([active]));
    await render().loadTodos();
    expect(render().todos).toEqual([active]);
    expect(render().error).toBeNull();
  });

  it("preserves state after malformed successful responses", async () => {
    await mount();
    fetchMock.mockResolvedValueOnce(json([null]));
    await render().toggleAllTodos({ completed: true });
    expect(render().todos).toEqual([active, completed]);
    expect(render().error).toBeInstanceOf(api.TodoApiError);
  });

  it("serializes requests and a failed action cannot undo a successful queued action", async () => {
    await mount();
    let resolveUpdate!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveUpdate = resolve; }));
    fetchMock.mockResolvedValueOnce(json({ ...active, title: "Saved" }));
    const first = render().updateTodo(active.id, { completed: true });
    const second = render().updateTodo(active.id, { title: "Saved" });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(render().isLoading).toBe(true);
    expect(render().todos).toEqual([active, completed]);
    resolveUpdate(json({ error: "Failed" }, 500));
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(render().todos).toEqual([{ ...active, title: "Saved" }, completed]);
    expect(render().error).toBeNull();
    expect(render().isLoading).toBe(false);
  });

  it("finishes the initial load before applying an action queued during loading", async () => {
    let resolveLoad!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const deletion = render().deleteTodo(active.id);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveLoad(json([active, completed]));
    await deletion;
    expect(render().todos).toEqual([completed]);
  });

  it("keeps a successful mutation when a later queued mutation fails", async () => {
    await mount();
    const created = { ...active, id: "3", title: "Saved" };
    fetchMock.mockResolvedValueOnce(json(created, 201));
    fetchMock.mockRejectedValueOnce(new TypeError("Offline"));
    const creation = render().createTodo({ title: "Saved" });
    const clearing = render().clearCompletedTodos();
    await Promise.all([creation, clearing]);
    expect(render().todos).toEqual([active, completed, created]);
    expect(render().error).toMatchObject({ status: 0, message: "Offline" });
    expect(render().isLoading).toBe(false);
  });

  it("does not update state or start queued requests after unmount", async () => {
    await mount();
    let resolveDelete!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveDelete = resolve; }));
    const deletion = render().deleteTodo(active.id);
    const clearing = render().clearCompletedTodos();
    await Promise.resolve();
    hooks.cleanups.splice(0).forEach((cleanup) => cleanup());
    resolveDelete(new Response(null, { status: 204 }));
    await Promise.all([deletion, clearing]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(render().todos).toEqual([active, completed]);
  });
});
