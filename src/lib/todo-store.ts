import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Todo } from "@/types/todo";
import {
  validateCreateTodoInput,
  validateToggleAllInput,
  validateUpdateTodoInput,
} from "@/lib/todo-validation";

export class TodoNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Todo not found.");
    this.name = "TodoNotFoundError";
  }
}

interface TodoRow {
  id: string;
  title: string;
  completed: number;
  createdAt: string;
}

function toTodo(row: TodoRow): Todo {
  return { ...row, completed: row.completed === 1 };
}

function readTodos(database: DatabaseSync): Todo[] {
  const rows = database.prepare(`
    SELECT id, title, completed, createdAt FROM todos
    ORDER BY createdAt ASC, sequence ASC
  `).all() as unknown as TodoRow[];
  return rows.map(toTodo);
}

export function createTodoStore(
  databasePath = process.env.TODO_DB_PATH ?? resolve(".data", "todos.sqlite"),
) {
  const path = resolve(databasePath);

  function withDatabase<T>(operation: (database: DatabaseSync) => T): T {
    mkdirSync(dirname(path), { recursive: true });
    const database = new DatabaseSync(path);
    try {
      database.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS todos (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL CHECK (length(trim(title)) > 0),
          completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
          createdAt TEXT NOT NULL
        );
        BEGIN IMMEDIATE;
      `);
      const result = operation(database);
      database.exec("COMMIT");
      return result;
    } finally {
      // Closing also rolls back any transaction interrupted by an error.
      database.close();
    }
  }

  return {
    listTodos(): Todo[] {
      return withDatabase(readTodos);
    },

    createTodo(input: unknown): Todo {
      const { title } = validateCreateTodoInput(input);
      return withDatabase((database) => {
        const todo: Todo = {
          id: randomUUID(),
          title,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        database.prepare(`
          INSERT INTO todos (id, title, completed, createdAt) VALUES (?, ?, ?, ?)
        `).run(todo.id, todo.title, 0, todo.createdAt);
        return todo;
      });
    },

    updateTodo(id: string, input: unknown): Todo {
      const update = validateUpdateTodoInput(input);
      return withDatabase((database) => {
        const row = database.prepare(`
          UPDATE todos SET title = COALESCE(?, title), completed = COALESCE(?, completed)
          WHERE id = ? RETURNING id, title, completed, createdAt
        `).get(
          update.title ?? null,
          update.completed === undefined ? null : Number(update.completed),
          id,
        ) as unknown as TodoRow | undefined;
        if (!row) throw new TodoNotFoundError();
        return toTodo(row);
      });
    },

    deleteTodo(id: string): void {
      withDatabase((database) => {
        const result = database.prepare("DELETE FROM todos WHERE id = ?").run(id);
        if (result.changes === 0) throw new TodoNotFoundError();
      });
    },

    toggleAllTodos(completed: boolean): Todo[] {
      const input = validateToggleAllInput({ completed });
      return withDatabase((database) => {
        database.prepare("UPDATE todos SET completed = ?").run(Number(input.completed));
        return readTodos(database);
      });
    },

    clearCompletedTodos(): void {
      withDatabase((database) => {
        database.prepare("DELETE FROM todos WHERE completed = 1").run();
      });
    },
  };
}

export function listTodos(): Todo[] {
  return createTodoStore().listTodos();
}

export function createTodo(input: unknown): Todo {
  return createTodoStore().createTodo(input);
}

export function updateTodo(id: string, input: unknown): Todo {
  return createTodoStore().updateTodo(id, input);
}

export function deleteTodo(id: string): void {
  createTodoStore().deleteTodo(id);
}

export function toggleAllTodos(completed: boolean): Todo[] {
  return createTodoStore().toggleAllTodos(completed);
}

export function clearCompletedTodos(): void {
  createTodoStore().clearCompletedTodos();
}
