"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "@/lib/todo-api";
import type {
  CreateTodoInput,
  Todo,
  ToggleAllInput,
  UpdateTodoInput,
} from "@/types/todo";

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<api.TodoApiError | null>(null);
  const mounted = useRef(false);
  const pending = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // Serialize reads and writes so an older response cannot undo a newer action.
  const run = useCallback(<T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    pending.current += 1;
    if (mounted.current) setIsLoading(true);
    const result = queue.current.then(async () => {
      try {
        if (!mounted.current) return;
        setError(null);
        return await operation();
      } catch (cause) {
        if (mounted.current) {
          setError(
            cause instanceof api.TodoApiError
              ? cause
              : new api.TodoApiError(
                  cause instanceof Error ? cause.message : "Todo request failed",
                  0,
                  cause,
                ),
          );
        }
      } finally {
        pending.current -= 1;
        if (mounted.current) setIsLoading(pending.current > 0);
      }
    });
    queue.current = result;
    return result;
  }, []);

  const loadTodos = useCallback(() => run(async () => {
    const result = await api.fetchTodos();
    if (mounted.current) setTodos(result);
    return result;
  }), [run]);

  useEffect(() => {
    mounted.current = true;
    void loadTodos();
    return () => {
      mounted.current = false;
    };
  }, [loadTodos]);

  const createTodo = useCallback((input: CreateTodoInput) => run(async () => {
    const result = await api.createTodo(input);
    if (mounted.current) {
      setTodos((current) => [
        ...current.filter((todo) => todo.id !== result.id),
        result,
      ]);
    }
    return result;
  }), [run]);

  const updateTodo = useCallback((id: Todo["id"], input: UpdateTodoInput) => run(async () => {
    const result = await api.updateTodo(id, input);
    if (mounted.current) {
      setTodos((current) => current.map((todo) => todo.id === id ? result : todo));
    }
    return result;
  }), [run]);

  const deleteTodo = useCallback((id: Todo["id"]) => run(async () => {
    await api.deleteTodo(id);
    if (mounted.current) setTodos((current) => current.filter((todo) => todo.id !== id));
    return true;
  }), [run]);

  const toggleAllTodos = useCallback((input: ToggleAllInput) => run(async () => {
    const result = await api.toggleAllTodos(input);
    if (mounted.current) setTodos(result);
    return result;
  }), [run]);

  const clearCompletedTodos = useCallback(() => run(async () => {
    await api.clearCompletedTodos();
    if (mounted.current) setTodos((current) => current.filter((todo) => !todo.completed));
    return true;
  }), [run]);

  const completedCount = todos.filter((todo) => todo.completed).length;
  return {
    todos,
    activeCount: todos.length - completedCount,
    completedCount,
    isLoading,
    error,
    loadTodos,
    createTodo,
    updateTodo,
    deleteTodo,
    toggleAllTodos,
    clearCompletedTodos,
  };
}
