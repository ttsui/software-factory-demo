import { describe, expectTypeOf, it } from "vitest";
import type {
  CreateTodoInput,
  Todo,
  TodoFilter,
  ToggleAllInput,
  UpdateTodoInput,
} from "@/types/todo";

describe("shared Todo contracts", () => {
  it("defines the canonical JSON Todo shape", () => {
    expectTypeOf<Todo>().toEqualTypeOf<{
      id: string;
      title: string;
      completed: boolean;
      createdAt: string;
    }>();
  });

  it("limits filters to the three supported views", () => {
    expectTypeOf<TodoFilter>().toEqualTypeOf<"all" | "active" | "completed">();
  });

  it("requires a title for creation and a completion target for bulk toggles", () => {
    expectTypeOf<CreateTodoInput>().toEqualTypeOf<{ title: string }>();
    expectTypeOf<ToggleAllInput>().toEqualTypeOf<{ completed: boolean }>();
  });

  it("allows partial title and completion updates without server-owned fields", () => {
    expectTypeOf<UpdateTodoInput>().toEqualTypeOf<{
      title?: string;
      completed?: boolean;
    }>();
  });
});
