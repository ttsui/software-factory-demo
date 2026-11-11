# Implementation Plan: TodoMVC Full-Stack Application (MVP)

> **Task List Target:** Tasks and verification checkpoints are tracked in GitHub Issues and linked to GitHub Project [#5 (Software Factory Demo)](https://github.com/users/ttsui/projects/5/views/1).
> Product requirements: [mvp-prd.md](../prds/mvp-prd.md) | Technical specification: [mvp-spec.md](../specs/mvp-spec.md)

## Overview

We are building a full-stack TodoMVC web application using the Next.js App Router, TypeScript 7 (`@typescript/native` side-by-side with `@typescript/typescript6`), and Tailwind CSS / `shadcn/ui` (Base UI primitives). The application provides full functional parity with the canonical TodoMVC user experience—including autofocused creation, single and bulk completion toggling (`Toggle All`), double-click inline editing (`Enter`/`blur` commit, empty-string delete, `Escape` cancel), active item counter with singular/plural grammar, URL hash filter routing (`#/`, `#/active`, `#/completed`), and `Clear completed`—backed by stateless HTTP JSON Route Handlers (`/api/todos`) and durable server-side persistence with zero authentication.

## Architecture Decisions

1. **TypeScript 7 & TypeScript 6 Side-by-Side Compatibility Setup:**
   - Install `@typescript/native` (`npm:typescript@^7.0.2`) for the native Go-based `tsc` binary (`pnpm tsc --noEmit`) and alias `typescript` to `npm:@typescript/typescript6@^6.0.2` so Next.js (`next build`, `next/typescript`) and ESLint can import the programmatic `ts.*` JavaScript API.
   - Omit `baseUrl` in `tsconfig.json` (removed in TS 7), use relative path aliases (`"@/*": ["./src/*"]`), `"module": "esnext"`, `"moduleResolution": "bundler"`, and explicit `"types": ["node", "react", "react-dom"]`.
2. **Contract-First Decomposition for Maximum Parallelism:**
   - Defining `src/types/todo.ts` in **Task 1** locks the `Todo` model (`id`, `title`, `completed`, `createdAt`) and request/response DTO contracts immediately.
   - Once **Task 1** completes, backend persistence (**Task 2**) and the frontend API client + state hook (**Task 3**) can be built in parallel.
   - Once **Tasks 2 & 3** complete, **5 independent feature slices (Tasks 4–8)** can be implemented simultaneously by separate agents/developers with zero file collisions.
3. **Durable Local Persistence with Test Isolation:**
   - Encapsulate storage in `src/lib/todo-store.ts` using durable SQLite / file-backed storage, accepting a configurable database file path via environment variable (`TODO_DB_PATH`) so parallel test suites can run against isolated temporary stores without contention.
4. **Disjoint Route Handlers & Disjoint UI Component Slices:**
   - Split backend routes by Next.js App Router path boundaries: collection routes (`src/app/api/todos/route.ts`, `src/app/api/todos/toggle-all/route.ts`, `src/app/api/todos/completed/route.ts`) in **Task 4** and item routes (`src/app/api/todos/[id]/route.ts`) in **Task 5**.
   - Split frontend UI into three isolated component slices (**Task 6**: `TodoHeader`, **Task 7**: `TodoList` + `TodoItem`, **Task 8**: `TodoFooter` + `useTodoFilter`) before assembling them in **Task 9** (`TodoApp` + `src/app/page.tsx`).

## Dependency Graph & Parallel Execution Waves

```text
                                ┌──────────┐
                                │  Task 1  │
                                └────┬─────┘
                   ┌─────────────────┴─────────────────┐
                   ▼                                   ▼
              ┌──────────┐                        ┌──────────┐
              │  Task 2  │                        │  Task 3  │
              └────┬─────┘                        └────┬─────┘
            ┌──────┴──────┐               ┌────────────┼────────────┐
            ▼             ▼               ▼            ▼            ▼
       ┌──────────┐  ┌──────────┐    ┌──────────┐ ┌──────────┐ ┌──────────┐
       │  Task 4  │  │  Task 5  │    │  Task 6  │ │  Task 7  │ │  Task 8  │
       └────┬─────┘  └────┬─────┘    └────┬─────┘ └────┬─────┘ └────┬─────┘
            └─────────────┴───────────────┼────────────┴────────────┘
                                          ▼
                                     ┌──────────┐
                                     │  Task 9  │
                                     └──────────┘
```

### Parallel Stream File Ownership Matrix

| Wave | Stream | Issue / Task | Unblocked By | Exclusive Files Owned (Zero Overlap) |
|------|--------|--------------|--------------|--------------------------------------|
| **Wave 1** | Foundation | [#2 Task 1](https://github.com/ttsui/software-factory-demo/issues/2) | — | `package.json`, `tsconfig.json`, `src/types/todo.ts`, `src/lib/utils.ts` |
| **Wave 2** | **Stream A (Backend)** | [#3 Task 2](https://github.com/ttsui/software-factory-demo/issues/3) | #2 | `src/lib/todo-store.ts`, `src/lib/todo-validation.ts`, `tests/todo-store.test.ts` |
| **Wave 2** | **Stream B (Frontend)** | [#4 Task 3](https://github.com/ttsui/software-factory-demo/issues/4) | #2 | `src/lib/todo-api.ts`, `src/hooks/use-todos.ts`, `tests/use-todos.test.ts` |
| **Wave 3** | **Stream A1 (API Collection)** | [#6 Task 4](https://github.com/ttsui/software-factory-demo/issues/6) | #3 | `src/app/api/todos/route.ts`, `src/app/api/todos/toggle-all/route.ts`, `src/app/api/todos/completed/route.ts`, `tests/api-todos-collection.test.ts` |
| **Wave 3** | **Stream A2 (API Item)** | [#7 Task 5](https://github.com/ttsui/software-factory-demo/issues/7) | #3 | `src/app/api/todos/[id]/route.ts`, `tests/api-todos-item.test.ts` |
| **Wave 3** | **Stream B1 (Header UI)** | [#8 Task 6](https://github.com/ttsui/software-factory-demo/issues/8) | #2, #4 | `src/components/todo-header.tsx`, `tests/todo-header.test.tsx` |
| **Wave 3** | **Stream B2 (List/Row UI)** | [#9 Task 7](https://github.com/ttsui/software-factory-demo/issues/9) | #2, #4 | `src/components/todo-item.tsx`, `src/components/todo-list.tsx`, `tests/todo-item.test.tsx` |
| **Wave 3** | **Stream B3 (Footer/Filter)** | [#10 Task 8](https://github.com/ttsui/software-factory-demo/issues/10) | #2, #4 | `src/hooks/use-todo-filter.ts`, `src/components/todo-footer.tsx`, `tests/todo-footer.test.tsx` |
| **Wave 4** | Integration | [#12 Task 9](https://github.com/ttsui/software-factory-demo/issues/12) | #6–#10 | `src/components/todo-app.tsx`, `src/app/page.tsx`, `tests/todo-app.integration.test.tsx` |

## Task List (GitHub Issues Index)

All tasks and checkpoints are tracked in [GitHub Project #5](https://github.com/users/ttsui/projects/5/views/1):

### Phase 1: Foundation & Shared Contracts
- **Task 1:** [#2 — Task 1: Scaffold Next.js App Router, TypeScript 7/6 Setup & Shared Contracts](https://github.com/ttsui/software-factory-demo/issues/2) *(Wave 1, Size: M, Priority: P0)*
- **Task 2:** [#3 — Task 2: Durable Todo Storage Layer & Validation Helpers](https://github.com/ttsui/software-factory-demo/issues/3) *(Wave 2 Parallel Track A, Depends on #2, Size: S, Priority: P0)*
- **Task 3:** [#4 — Task 3: Frontend Todo API Client & State Management Hook](https://github.com/ttsui/software-factory-demo/issues/4) *(Wave 2 Parallel Track B, Depends on #2, Size: S, Priority: P0)*

### Checkpoint: Foundation
- **Checkpoint 1:** [#5 — Checkpoint 1: Foundation & Contracts Ready (After Tasks 1-3)](https://github.com/ttsui/software-factory-demo/issues/5) *(Depends on #2, #3, #4)*

### Phase 2: Parallel Feature Slices
- **Task 4:** [#6 — Task 4: Collection API Endpoints (GET/POST/DELETE /api/todos & toggle-all)](https://github.com/ttsui/software-factory-demo/issues/6) *(Wave 3 Parallel Track A1, Depends on #3, Size: M, Priority: P1)*
- **Task 5:** [#7 — Task 5: Single-Item API Endpoints (PATCH & DELETE /api/todos/:id)](https://github.com/ttsui/software-factory-demo/issues/7) *(Wave 3 Parallel Track A2, Depends on #3, Size: S, Priority: P1)*
- **Task 6:** [#8 — Task 6: Todo Header, Autofocus New-Todo Input & Toggle-All Control Component](https://github.com/ttsui/software-factory-demo/issues/8) *(Wave 3 Parallel Track B1, Depends on #2, #4, Size: S, Priority: P1)*
- **Task 7:** [#9 — Task 7: Todo List & Inline-Editable Todo Item Row Component](https://github.com/ttsui/software-factory-demo/issues/9) *(Wave 3 Parallel Track B2, Depends on #2, #4, Size: M, Priority: P1)*
- **Task 8:** [#10 — Task 8: Todo Footer, Active Counter, Hash/URL Filter Routing & Clear Completed](https://github.com/ttsui/software-factory-demo/issues/10) *(Wave 3 Parallel Track B3, Depends on #2, #4, Size: M, Priority: P1)*

### Checkpoint: Core Features
- **Checkpoint 2:** [#11 — Checkpoint 2: Core Backend & Frontend Slices Complete (After Tasks 4-8)](https://github.com/ttsui/software-factory-demo/issues/11) *(Depends on #6, #7, #8, #9, #10)*

### Phase 3: Integration & Polish
- **Task 9:** [#12 — Task 9: TodoApp Page Assembly, End-to-End Integration & Error Handling](https://github.com/ttsui/software-factory-demo/issues/12) *(Wave 4, Depends on #6, #7, #8, #9, #10, Size: M, Priority: P1)*

### Checkpoint: Complete
- **Checkpoint 3:** [#13 — Checkpoint 3: MVP Complete & Ready for Review (After Task 9)](https://github.com/ttsui/software-factory-demo/issues/13) *(Depends on #12)*

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Next.js `next build` auto-modifies `tsconfig.json` or conflicts with TypeScript 7 options | High | Configure side-by-side `@typescript/native` (`^7.0.2`) and `typescript` (`npm:@typescript/typescript6@^6.0.2`) in Task 1 and verify both `pnpm tsc --noEmit` and `pnpm build` immediately in Wave 1. |
| Merge conflicts when multiple agents work in parallel during Wave 2 and Wave 3 | Med | Each task in Wave 2 (Tasks 2–3) and Wave 3 (Tasks 4–8) touches strictly disjoint source and test files; shared `src/types/todo.ts` and `package.json` are locked in Task 1. |
| Duplicate commit on inline edit when `Enter` key triggers both keydown save and subsequent input `blur` | Med | Track an `isCommitting` / `isCancelled` ref in `TodoItem` (Task 7) and cover `Enter`-then-`blur` and `Escape`-then-`blur` explicitly in `tests/todo-item.test.tsx`. |
| Concurrent test runs colliding on the durable storage file | Med | Support per-test database file paths in `src/lib/todo-store.ts` (Task 2) so unit and route tests run isolated temp stores. |

## Open Questions

- None blocking MVP implementation; both `POST /api/todos/toggle-all` + `PATCH /api/todos` and `DELETE /api/todos?completed=true` + `DELETE /api/todos/completed` route variants allowed by `specs/mvp-spec.md` are supported in Task 4 so any compliant client or test harness succeeds.
