import type {
  CreateTodoInput,
  ToggleAllInput,
  UpdateTodoInput,
} from "@/types/todo";

export class TodoValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "TodoValidationError";
  }
}

function validateObject(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TodoValidationError("Input must be an object.");
  }
  return input as Record<string, unknown>;
}

export function validateTitle(title: unknown): string {
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new TodoValidationError("Title must be a non-empty string.");
  }
  return title.trim();
}

function validateCompleted(completed: unknown): boolean {
  if (typeof completed !== "boolean") {
    throw new TodoValidationError("Completed must be a boolean.");
  }
  return completed;
}

export function validateCreateTodoInput(input: unknown): CreateTodoInput {
  return { title: validateTitle(validateObject(input).title) };
}

export function validateUpdateTodoInput(input: unknown): UpdateTodoInput {
  const value = validateObject(input);
  const update: UpdateTodoInput = {};
  if (Object.hasOwn(value, "title")) {
    update.title = validateTitle(value.title);
  }
  if (Object.hasOwn(value, "completed")) {
    update.completed = validateCompleted(value.completed);
  }
  return update;
}

export function validateToggleAllInput(input: unknown): ToggleAllInput {
  return { completed: validateCompleted(validateObject(input).completed) };
}
