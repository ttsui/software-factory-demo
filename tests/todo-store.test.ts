import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCompletedTodos,
  createTodo,
  createTodoStore,
  deleteTodo,
  listTodos,
  TodoNotFoundError,
  toggleAllTodos,
  updateTodo,
} from "@/lib/todo-store";
import {
  TodoValidationError,
  validateCreateTodoInput,
  validateToggleAllInput,
  validateUpdateTodoInput,
} from "@/lib/todo-validation";

let directory: string;
let path: string;
let store: ReturnType<typeof createTodoStore>;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "todo-store-"));
  path = join(directory, "nested", "todos.sqlite");
  store = createTodoStore(path);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("durable todo store", () => {
  it("starts empty and creates trimmed, uniquely identified, incomplete todos", () => {
    expect(store.listTodos()).toEqual([]);
    const first = store.createTodo({ title: " \tBuy milk\n " });
    const second = store.createTodo({ title: "Buy milk" });
    expect(first).toEqual({
      id: expect.any(String),
      title: "Buy milk",
      completed: false,
      createdAt: expect.any(String),
    });
    expect(first.id).not.toBe(second.id);
    expect(new Date(first.createdAt).toISOString()).toBe(first.createdAt);
    expect(store.listTodos()).toEqual([first, second]);
  });

  it("persists creates, updates, and deletions across store re-instantiation", () => {
    const first = store.createTodo({ title: "First" });
    const second = store.createTodo({ title: "Second" });
    const updated = store.updateTodo(first.id, { title: " Changed ", completed: true });
    store.deleteTodo(second.id);
    expect(createTodoStore(path).listTodos()).toEqual([updated]);
  });

  it("reads and writes committed data from a separate server process", () => {
    const first = store.createTodo({ title: "Before restart" });
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { DatabaseSync } from "node:sqlite";
      const database = new DatabaseSync(process.argv[1]);
      console.log(JSON.stringify(database.prepare(
        "SELECT id, title, completed, createdAt FROM todos"
      ).all()));
      database.prepare("UPDATE todos SET title = ? WHERE id = ?")
        .run("After restart", process.argv[2]);
      database.close();
    `, path, first.id], { encoding: "utf8" });
    expect(JSON.parse(output)).toEqual([{ ...first, completed: 0 }]);
    expect(createTodoStore(path).listTodos()).toEqual([{ ...first, title: "After restart" }]);
  });

  it("orders by createdAt, retaining insertion order for tied timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    const later = store.createTodo({ title: "Later timestamp" });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const first = store.createTodo({ title: "First tied timestamp" });
    const second = store.createTodo({ title: "Second tied timestamp" });
    store.updateTodo(first.id, { completed: true });
    expect(createTodoStore(path).listTodos().map((todo) => todo.id))
      .toEqual([first.id, second.id, later.id]);
  });

  it("updates only specified fields and preserves server-owned fields", () => {
    const todo = store.createTodo({ title: "Original" });
    expect(store.updateTodo(todo.id, { completed: true })).toEqual({ ...todo, completed: true });
    expect(store.updateTodo(todo.id, { title: " Edited " }))
      .toEqual({ ...todo, title: "Edited", completed: true });
    expect(store.updateTodo(todo.id, { completed: false, id: "replacement", createdAt: "invalid" }))
      .toEqual({ ...todo, title: "Edited" });
    expect(store.updateTodo(todo.id, {})).toEqual({ ...todo, title: "Edited" });
  });

  it("signals typed not-found errors without altering stored todos", () => {
    const todo = store.createTodo({ title: "Keep" });
    expect(() => store.updateTodo("missing", { completed: true })).toThrow(TodoNotFoundError);
    expect(() => store.updateTodo("missing", {})).toThrow(TodoNotFoundError);
    expect(() => store.deleteTodo("missing")).toThrow(TodoNotFoundError);
    expect(store.listTodos()).toEqual([todo]);
    store.deleteTodo(todo.id);
    expect(() => store.deleteTodo(todo.id)).toThrow(TodoNotFoundError);
  });

  it("bulk toggles to an explicit target and clears only completed todos durably", () => {
    const first = store.createTodo({ title: "First" });
    const second = store.createTodo({ title: "Second" });
    expect(store.toggleAllTodos(true)).toEqual([
      { ...first, completed: true }, { ...second, completed: true },
    ]);
    expect(createTodoStore(path).listTodos()).toEqual(store.listTodos());
    expect(store.toggleAllTodos(true).every((todo) => todo.completed)).toBe(true);
    expect(store.toggleAllTodos(false)).toEqual([first, second]);
    store.updateTodo(first.id, { completed: true });
    store.clearCompletedTodos();
    expect(createTodoStore(path).listTodos()).toEqual([second]);
    store.toggleAllTodos(true);
    store.clearCompletedTodos();
    expect(createTodoStore(path).listTodos()).toEqual([]);
    expect(store.toggleAllTodos(false)).toEqual([]);
    expect(() => store.clearCompletedTodos()).not.toThrow();
  });

  it("keeps database paths isolated, including the environment-configured API", () => {
    vi.stubEnv("TODO_DB_PATH", path);
    const todo = createTodo({ title: "Environment store" });
    expect(listTodos()).toEqual([todo]);
    expect(createTodoStore(join(directory, "other.sqlite")).listTodos()).toEqual([]);
    updateTodo(todo.id, { completed: true });
    expect(toggleAllTodos(false)).toEqual([todo]);
    toggleAllTodos(true);
    clearCompletedTodos();
    expect(listTodos()).toEqual([]);
    const removable = createTodo({ title: "Delete" });
    deleteTodo(removable.id);
    expect(listTodos()).toEqual([]);
  });

  it("does not allow SQL in titles or IDs to change the database", () => {
    const todo = store.createTodo({ title: "'); DROP TABLE todos; --" });
    expect(() => store.deleteTodo("' OR 1=1 --")).toThrow(TodoNotFoundError);
    expect(() => store.updateTodo("' OR 1=1 --", { completed: true })).toThrow(TodoNotFoundError);
    expect(store.listTodos()).toEqual([todo]);
  });
});

describe("todo validation", () => {
  it.each([undefined, null, [], "title", 42, true, {}, { title: undefined },
    { title: null }, { title: 42 }, { title: false }, { title: "" }, { title: " \t\n " },
  ])("rejects invalid create input %j without writes", (input) => {
    expect(() => validateCreateTodoInput(input)).toThrow(TodoValidationError);
    expect(() => store.createTodo(input)).toThrow(TodoValidationError);
    expect(store.listTodos()).toEqual([]);
  });

  it.each([undefined, null, [], "title", { title: undefined }, { title: null },
    { title: 42 }, { title: "" }, { title: "\u2003 \n" }, { completed: undefined },
    { completed: null }, { completed: 1 }, { completed: "false" },
    { title: "Valid", completed: "true" },
  ])("rejects invalid update input %j atomically", (input) => {
    const todo = store.createTodo({ title: "Unchanged" });
    expect(() => validateUpdateTodoInput(input)).toThrow(TodoValidationError);
    expect(() => store.updateTodo(todo.id, input)).toThrow(TodoValidationError);
    expect(store.listTodos()).toEqual([todo]);
  });

  it.each([undefined, null, {}, [], { completed: 1 }, { completed: "true" }])
    ("rejects invalid toggle input %j", (input) => {
      expect(() => validateToggleAllInput(input)).toThrow(TodoValidationError);
    });

  it("rejects non-boolean bulk targets without changes", () => {
    const todo = store.createTodo({ title: "Keep active" });
    expect(() => store.toggleAllTodos("true" as unknown as boolean)).toThrow(TodoValidationError);
    expect(store.listTodos()).toEqual([todo]);
  });

  it("returns normalized DTOs and typed errors suitable for route handlers", () => {
    expect(validateCreateTodoInput({ title: " Title ", completed: true })).toEqual({ title: "Title" });
    expect(validateUpdateTodoInput({ title: " Edit ", completed: false }))
      .toEqual({ title: "Edit", completed: false });
    expect(validateToggleAllInput({ completed: true })).toEqual({ completed: true });
    expect(new TodoValidationError("Invalid").status).toBe(400);
    expect(new TodoNotFoundError().status).toBe(404);
  });
});
