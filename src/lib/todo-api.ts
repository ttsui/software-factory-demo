import type {
  CreateTodoInput,
  Todo,
  ToggleAllInput,
  UpdateTodoInput,
} from "@/types/todo";

export class TodoApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "TodoApiError";
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return body;
  if (body && typeof body === "object") {
    if ("error" in body) return errorMessage(body.error, fallback);
    if ("message" in body && typeof body.message === "string") {
      return body.message || fallback;
    }
  }
  return fallback;
}

async function request(path: string, method: string, input?: unknown) {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      cache: "no-store",
    });
  } catch (error) {
    throw new TodoApiError(
      error instanceof Error ? error.message : "Unable to reach the Todo API",
      0,
      error,
    );
  }

  if (!response.ok) {
    const details: unknown = await response.json().catch(() => null);
    throw new TodoApiError(
      errorMessage(details, `Todo API request failed (${response.status})`),
      response.status,
      details,
    );
  }
  return response;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new TodoApiError("Invalid Todo API response", response.status, error);
  }
}

function isTodo(value: unknown): value is Todo {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "completed" in value &&
    typeof value.completed === "boolean" &&
    "createdAt" in value &&
    typeof value.createdAt === "string"
  );
}

function todoList(value: unknown, status: number): Todo[] {
  if (
    !Array.isArray(value) ||
    !value.every(isTodo) ||
    new Set(value.map((todo) => todo.id)).size !== value.length
  ) {
    throw new TodoApiError("Invalid Todo API response", status, value);
  }
  return value;
}

async function readTodo(response: Response): Promise<Todo> {
  const value = await readJson(response);
  if (!isTodo(value)) {
    throw new TodoApiError("Invalid Todo API response", response.status, value);
  }
  return value;
}

export async function fetchTodos(): Promise<Todo[]> {
  const response = await request("/api/todos", "GET");
  return todoList(await readJson(response), response.status);
}

export async function createTodo(input: CreateTodoInput): Promise<Todo> {
  return readTodo(await request("/api/todos", "POST", input));
}

export async function updateTodo(
  id: Todo["id"],
  input: UpdateTodoInput,
): Promise<Todo> {
  return readTodo(
    await request(`/api/todos/${encodeURIComponent(id)}`, "PATCH", input),
  );
}

export async function deleteTodo(id: Todo["id"]): Promise<void> {
  await request(`/api/todos/${encodeURIComponent(id)}`, "DELETE");
}

export async function toggleAllTodos(input: ToggleAllInput): Promise<Todo[]> {
  const response = await request("/api/todos/toggle-all", "POST", input);
  const value = await readJson(response);
  return Array.isArray(value)
    ? todoList(value, response.status)
    : fetchTodos();
}

export async function clearCompletedTodos(): Promise<void> {
  await request("/api/todos/completed", "DELETE");
}
