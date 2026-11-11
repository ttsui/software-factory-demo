# Product Requirements Document (PRD): TodoMVC Application (MVP)

## 1. Overview & Vision
The objective of this MVP is to deliver a clean, responsive, and reliable task management web application that is functionally equivalent to the standard [TodoMVC](https://todomvc.com/) user experience, with server-side persistence so tasks remain available across browser sessions and page refreshes. The application requires **no user authentication**, operating as a shared, immediately accessible todo list.

> For technical architecture, data models, and API specifications, see [mvp-spec.md](../specs/mvp-spec.md).

---

## 2. Goals & Non-Goals

### Goals
- Achieve full functional parity with the canonical TodoMVC user experience and interaction flows.
- Persist all todo items on a backend so state survives page reloads, browser restarts, and cross-session access.
- Provide a fast, intuitive, keyboard-friendly UI with immediate visual feedback.

### Non-Goals (Out of Scope for MVP)
- User accounts, login, registration, or authentication/authorization of any kind.
- Multi-list management, tags, due dates, priority levels, or subtasks.
- Real-time multi-user live collaboration cursors or notifications.
- Rich-text formatting or file attachments.

---

## 3. Target User & Use Cases
- **Individual User / Demo Evaluator:** Anyone who wants to quickly capture, organize, complete, filter, and clean up action items in a friction-free interface without signing up.

---

## 4. Product & User Experience Requirements (TodoMVC Parity)

### 4.1 Initial Load & Empty State
- When a user opens the application, all previously saved todos are displayed in the order they were created.
- When there are **no todos**, the main list area and the footer bar (item counter, filters, clear button) are **hidden**.
- The new-todo input field at the top of the page is **autofocused** on initial load so the user can start typing immediately.

### 4.2 Creating a Todo
- A top input field displays the placeholder text: `"What needs to be done?"`.
- Pressing `Enter` trims leading and trailing whitespace from the input:
  - If the trimmed text is non-empty, a new incomplete todo item is added to the list, saved to the backend, and the input field is cleared.
  - If the trimmed text is empty, nothing happens.

### 4.3 Viewing & Toggling Todos
- Each todo item displays:
  - A completion checkbox indicating whether the item is done.
  - The todo title text (styled with a strikethrough and muted color when completed).
  - A delete (`×`) button that appears when hovering over the item.
- Clicking a todo's checkbox toggles its completion state and saves the change.

### 4.4 Toggle All (Bulk Complete / Incomplete)
- A "Toggle All" control is displayed next to the new-todo input whenever at least one todo exists.
- It appears active/checked if and only if **all** todos are currently completed.
- Clicking "Toggle All":
  - Marks all todos as **completed** if any todo is still active.
  - Marks all todos as **active** (incomplete) if all todos are currently completed.

### 4.5 Inline Editing a Todo
- **Double-clicking** a todo's title enters **edit mode** for that item:
  - Hides the checkbox, title label, and delete button for that row.
  - Shows an inline text input pre-filled with the current title and focused automatically.
- **Saving edits:** Pressing `Enter` or clicking outside (blurring) the input trims the text:
  - If non-empty, updates the todo's title and exits edit mode.
  - If empty, deletes the todo item from the list.
- **Canceling edits:** Pressing `Escape` discards unsaved changes, restores the original title, and exits edit mode.

### 4.6 Deleting Todos
- **Single delete:** Clicking the `×` button on a todo item removes it permanently.
- **Clear completed:** Clicking the `"Clear completed"` button in the footer removes all completed todos at once.
  - This button is only visible when at least one todo is completed.

### 4.7 Footer, Counter & Filtering
- The footer bar is visible whenever at least one todo exists in total (regardless of the active filter).
- **Active Item Counter:**
  - Displays the number of incomplete todos with proper pluralization: `"0 items left"`, `"1 item left"`, or `"<N> items left"`.
- **View Filters:**
  - Users can filter the displayed list by three states, reflected in the URL so views can be bookmarked or refreshed:
    - **All:** Shows all todos (default).
    - **Active:** Shows only incomplete todos.
    - **Completed:** Shows only completed todos.
  - The active filter is visually highlighted.

---

## 5. Non-Functional Requirements
- **Zero Authentication:** Immediately usable without login prompts, user sessions, or credentials.
- **Usability & Accessibility:** Keyboard-friendly interactions (`Enter`, `Escape`, `Tab`) and clean, high-contrast TodoMVC styling.
- **Reliability:** All user actions are durably saved on the backend and gracefully handle network or validation errors.

---

## 6. Acceptance Criteria Summary
1. User can open the app immediately without logging in and see existing todos loaded from the backend.
2. Creating, editing, toggling, bulk-toggling, deleting, and clearing completed todos all persist and remain intact after a page refresh.
3. Empty/whitespace-only new todos are ignored; editing an existing todo to an empty string deletes it; pressing `Escape` while editing cancels the edit.
4. Footer and Toggle-All controls remain hidden when the todo list is empty.
5. Active item count accurately reflects incomplete items with singular/plural grammar (`1 item left` vs `2 items left`).
6. Filtering by `All`, `Active`, and `Completed` updates the visible list and URL, and `"Clear completed"` only appears when completed items exist.

