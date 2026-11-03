/* Read-only presentation of records supplied by an authorised dashboard.
   No Auth, database, Storage, or network calls belong in this component. */
export function parseServiceDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    typeof value === "string" ? value : "",
  );
  if (!m) return null;
  const [year, month, day] = m.slice(1).map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31)
    return null;
  // UTC is only a timezone-neutral carrier for calendar arithmetic, not a
  // conversion of a stored preferred date into an appointment instant.
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}
export function dateKey(date) {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
const mytDayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateFormatters = new Map();
export function malaysiaToday(now = new Date()) {
  const parts = mytDayFormatter.formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addServiceDays(key, days) {
  const date = parseServiceDate(key);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  const result = dateKey(date);
  return parseServiceDate(result) ? result : null;
}
export function shiftServiceMonth(key, months) {
  const date = parseServiceDate(key);
  if (!date) return null;
  const wanted = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null;
  const last = new Date(date.getTime());
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  date.setUTCDate(Math.min(wanted, last.getUTCDate()));
  return dateKey(date);
}
export function serviceTime(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,6})?)?$/.exec(
    typeof value === "string" ? value : "",
  );
  if (!m) return null;
  return {
    sort: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0),
    label: `${Number(m[1]) % 12 || 12}:${m[2]} ${Number(m[1]) < 12 ? "am" : "pm"}`,
  };
}
export function readableServiceDate(
  key,
  options = { day: "numeric", month: "short", year: "numeric" },
) {
  const date = parseServiceDate(key);
  if (!date) return "Date unavailable";
  const formatKey = JSON.stringify(options);
  if (!dateFormatters.has(formatKey))
    dateFormatters.set(
      formatKey,
      new Intl.DateTimeFormat("en-MY", { ...options, timeZone: "UTC" }),
    );
  return dateFormatters.get(formatKey).format(date);
}
const statusText = {
  pending: "Pending · not confirmed",
  provider_selected: "Awaiting confirmation · tentative",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed · history",
  cancelled: "Cancelled · history",
};
export function serviceStatus(status, role = "provider") {
  return status === "provider_selected" && role === "client"
    ? "Provider selected · awaiting confirmation"
    : Object.hasOwn(statusText, status)
      ? statusText[status]
      : "Status unavailable";
}
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const safeWorkflow = (href) =>
  typeof href === "string" &&
  /^(incoming-requests\.html|assignment-details\.html|request-details\.html\?request_id=[^\s]*)$/.test(
    href,
  )
    ? href
    : null;
let nextCalendarId = 0;
export function createServiceCalendar(
  root,
  { role = "provider", onRefresh = () => {}, now = () => new Date() } = {},
) {
  if (!root) return null;
  const id = `service-calendar-${++nextCalendarId}`;
  const state = {
    selected: malaysiaToday(now()),
    view: "month",
    rows: [],
    hasData: false,
    loading: true,
    error: false,
  };
  const headings = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let stopped = false,
    restoreRefreshFocus = false;
  function sorted(rows) {
    return [...rows].sort(
      (a, b) =>
        (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99") ||
        (a.time?.sort ?? 86401) - (b.time?.sort ?? 86401) ||
        a.title.localeCompare(b.title) ||
        a.key - b.key,
    );
  }
  function requestsFor(day) {
    return sorted(state.rows.filter((r) => r.date === day));
  }
  function button(label, action, extra) {
    const b = el("button", "sc-button", label);
    b.type = "button";
    b.dataset.scAction = action;
    if (extra) Object.assign(b.dataset, extra);
    return b;
  }
  function badge(row) {
    return el(
      "span",
      `sc-status sc-status-${Object.hasOwn(statusText, row.status) ? row.status : "unknown"}`,
      serviceStatus(row.status, role),
    );
  }
  function requestCard(row, compact = false) {
    const card = el("li", "sc-request");
    const title = el("strong", null, row.title);
    card.append(
      title,
      el("span", "sc-request-id", row.id || "Request ID unavailable"),
      badge(row),
    );
    if (!compact && row.category)
      card.append(el("span", "sc-category", row.category));
    if (!compact)
      card.append(
        el(
          "span",
          "sc-preference",
          `Preferred date: ${readableServiceDate(row.date)}`,
        ),
      );
    card.append(
      el(
        "span",
        "sc-preference",
        `Preferred time: ${row.time ? row.time.label + " MYT" : "unavailable"}`,
      ),
    );
    if (row.area)
      card.append(
        el(
          "span",
          "sc-area",
          /^approximate area\b/i.test(row.area)
            ? row.area
            : `Approximate area: ${row.area}`,
        ),
      );
    if (row.href) {
      const link = el(
        "a",
        "sc-workflow-link",
        row.actionLabel || "View request",
      );
      link.href = row.href;
      card.append(link);
    } else
      card.append(
        el(
          "span",
          "sc-no-route",
          "No direct workflow is available for this status.",
        ),
      );
    return card;
  }
  function listPanel(
    heading,
    text,
    rows,
    { selected = false, empty = "No service requests for this date." } = {},
  ) {
    const panel = el(
      "section",
      `sc-list-panel${selected ? " sc-selected-panel" : ""}`,
    );
    const h = el("h3", null, heading);
    if (selected) {
      h.id = `${id}-selected-heading`;
      h.tabIndex = -1;
      panel.id = `${id}-selected`;
      panel.setAttribute("aria-labelledby", h.id);
    }
    panel.append(h, el("p", "sc-section-hint", text));
    if (!state.hasData) {
      panel.append(
        el(
          "p",
          "sc-empty",
          state.error
            ? "Service requests could not be loaded. Refresh to try again."
            : "Loading service requests…",
        ),
      );
      return panel;
    }
    if (!rows.length) panel.append(el("p", "sc-empty", empty));
    else {
      const list = el("ul", "sc-request-list");
      for (const row of rows) list.append(requestCard(row, selected));
      panel.append(list);
    }
    return panel;
  }
  function cell(day, month, week = false) {
    const rows = requestsFor(day),
      date = parseServiceDate(day),
      holder = el(
        week ? "section" : "div",
        `sc-day${day === state.selected ? " is-selected" : ""}${day === malaysiaToday(now()) ? " is-today" : ""}${!week && date?.getUTCMonth() !== month ? " is-outside" : ""}`,
      );
    if (!week) {
      holder.setAttribute("role", "gridcell");
      holder.setAttribute("aria-selected", String(day === state.selected));
    }
    if (!date) return holder;
    const b = button(
      week
        ? readableServiceDate(day, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })
        : String(date.getUTCDate()),
      "date",
      { date: day },
    );
    b.classList.add("sc-date");
    b.tabIndex = day === state.selected ? 0 : -1;
    b.setAttribute(
      "aria-label",
      `${readableServiceDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${day === malaysiaToday(now()) ? ", today" : ""}, ${state.hasData ? rows.length + " service requests" : "requests not yet loaded"}`,
    );
    b.setAttribute("aria-pressed", String(day === state.selected));
    b.setAttribute("aria-controls", `${id}-selected`);
    if (day === malaysiaToday(now())) b.setAttribute("aria-current", "date");
    holder.append(b);
    if (rows.length) {
      const count = el(
        "span",
        "sc-day-count",
        `${rows.length} ${rows.length === 1 ? "request" : "requests"}`,
      );
      count.dataset.count = String(rows.length);
      count.setAttribute("aria-hidden", "true");
      holder.append(count);
    }
    const previews = el("div", "sc-day-previews");
    for (const row of rows.slice(0, 2)) {
      const event =
        role === "client" && row.href
          ? el(
              "a",
              "sc-button",
              `${row.time ? row.time.label + " · " : ""}${row.title}`,
            )
          : button(
              `${row.time ? row.time.label + " · " : ""}${row.title}`,
              "event",
              { key: String(row.key) },
            );
      if (role === "client" && row.href) event.href = row.href;
      event.classList.add(
        "sc-event",
        `sc-event-${Object.hasOwn(statusText, row.status) ? row.status : "unknown"}`,
      );
      event.setAttribute(
        "aria-label",
        `${row.title}, ${serviceStatus(row.status, role)}. Show preferred date details.`,
      );
      previews.append(event);
    }
    if (rows.length > 2) {
      const more = button(`+${rows.length - 2} more`, "date", { date: day });
      more.classList.add("sc-more");
      previews.append(more);
    }
    holder.append(previews);
    return holder;
  }
  function render(focus = null) {
    if (stopped) return;
    const today = malaysiaToday(now()),
      selected = parseServiceDate(state.selected);
    root.classList.add("service-calendar");
    root.dataset.calendarState = state.error
      ? "error"
      : state.loading
        ? "loading"
        : state.hasData
          ? "ready"
          : "loading";
    root.dataset.calendarView = state.view;
    root.setAttribute("aria-busy", String(state.loading));
    const header = el("div", "sc-heading");
    const h = el("h2", null, "Service Calendar");
    h.id = `${id}-heading`;
    header.append(
      h,
      el(
        "p",
        "sc-description",
        "Preferred service dates and times, not a separate booking schedule.",
      ),
    );
    const refresh = button(
      state.loading ? "Refreshing…" : "Refresh",
      "refresh",
    );
    refresh.disabled = state.loading;
    refresh.setAttribute("aria-label", "Refresh service calendar");
    header.append(refresh);
    const toolbar = el("div", "sc-toolbar");
    const period = el(
      "h3",
      "sc-period",
      state.view === "month"
        ? readableServiceDate(state.selected, {
            month: "long",
            year: "numeric",
          })
        : `${readableServiceDate(addServiceDays(state.selected, -((selected.getUTCDay() + 6) % 7)))} – ${readableServiceDate(addServiceDays(state.selected, 6 - ((selected.getUTCDay() + 6) % 7)))}`,
    );
    period.id = `${id}-period`;
    const nav = el("div", "sc-navigation");
    const prev = button("‹", "previous"),
      next = button("›", "next");
    prev.setAttribute("aria-label", `Previous ${state.view}`);
    next.setAttribute("aria-label", `Next ${state.view}`);
    prev.disabled = !(state.view === "month"
      ? shiftServiceMonth(state.selected, -1)
      : addServiceDays(state.selected, -7));
    next.disabled = !(state.view === "month"
      ? shiftServiceMonth(state.selected, 1)
      : addServiceDays(state.selected, 7));
    nav.append(prev, button("Today", "today"), next);
    const views = el("div", "sc-views");
    views.setAttribute("role", "group");
    views.setAttribute("aria-label", "Calendar view");
    for (const value of ["month", "week"]) {
      const b = button(value === "month" ? "Month" : "Week", value);
      b.setAttribute("aria-pressed", String(value === state.view));
      views.append(b);
    }
    toolbar.append(period, nav, views);
    const note = el(
      "p",
      `sc-data-note${state.error ? " is-error" : ""}`,
      state.error
        ? state.hasData
          ? "Refresh failed. Showing the last successfully loaded requests; they may be outdated."
          : "Service requests could not be loaded. Use Refresh to try again."
        : state.loading
          ? state.hasData
            ? "Refreshing. The last loaded requests remain visible."
            : "Loading your service requests…"
          : "Select a date to see its requests.",
    );
    if (state.loading || state.error) note.setAttribute("role", "status");
    const legend = el("ul", "sc-legend");
    legend.setAttribute("aria-label", "Request status legend");
    for (const status of role === "client"
      ? [
          "pending",
          "provider_selected",
          "confirmed",
          "in_progress",
          "completed",
          "cancelled",
        ]
      : [
          "provider_selected",
          "confirmed",
          "in_progress",
          "completed",
          ...(state.rows.some((r) => r.status === "cancelled")
            ? ["cancelled"]
            : []),
        ]) {
      const item = el(
        "li",
        `sc-status sc-status-${status}`,
        serviceStatus(status, role),
      );
      legend.append(item);
    }
    const calendar = el(
      "div",
      state.view === "month" ? "sc-month-grid" : "sc-week-grid",
    );
    if (state.view === "month") {
      calendar.setAttribute("role", "grid");
      calendar.setAttribute("aria-labelledby", period.id);
      const days = el("div", "sc-weekdays");
      days.setAttribute("role", "row");
      for (const day of headings) {
        const label = el("span", null, day);
        label.setAttribute("role", "columnheader");
        days.append(label);
      }
      calendar.append(days);
      const first = state.selected.slice(0, 8) + "01",
        start = addServiceDays(
          first,
          -((parseServiceDate(first).getUTCDay() + 6) % 7),
        );
      for (let row = 0; row < 6; row++) {
        const week = el("div", "sc-month-row");
        week.setAttribute("role", "row");
        for (let col = 0; col < 7; col++) {
          const day = addServiceDays(start, row * 7 + col);
          week.append(cell(day, selected.getUTCMonth()));
        }
        calendar.append(week);
      }
    } else {
      const start = addServiceDays(
        state.selected,
        -((selected.getUTCDay() + 6) % 7),
      );
      calendar.setAttribute(
        "aria-label",
        "Preferred service requests this week",
      );
      for (let i = 0; i < 7; i++)
        calendar.append(
          cell(addServiceDays(start, i), selected.getUTCMonth(), true),
        );
    }
    const lists = el("div", "sc-lists");
    const active = new Set(
      role === "client"
        ? ["pending", "provider_selected", "confirmed", "in_progress"]
        : ["provider_selected", "confirmed", "in_progress"],
    );
    const upcoming = sorted(
      state.rows.filter(
        (r) => r.date && r.date >= today && active.has(r.status),
      ),
    ).slice(0, 5);
    lists.append(
      listPanel(
        `Selected day · ${readableServiceDate(state.selected)}`,
        "All loaded requests for this preferred date.",
        requestsFor(state.selected),
        { selected: true },
      ),
      listPanel(
        "Upcoming Services",
        "Today and later, ordered by preferred date and time.",
        upcoming,
        { empty: "No upcoming active service requests." },
      ),
    );
    const fragment = document.createDocumentFragment();
    fragment.append(header, toolbar, note, legend, calendar, lists);
    const unscheduled = state.rows.filter((r) => !r.date);
    if (unscheduled.length) {
      const details = el("details", "sc-unscheduled"),
        summary = el(
          "summary",
          null,
          `Date unavailable (${unscheduled.length})`,
        );
      details.append(
        summary,
        el(
          "p",
          "sc-section-hint",
          "These requests have no valid preferred date. No calendar date has been assigned.",
        ),
      );
      const list = el("ul", "sc-request-list");
      for (const row of unscheduled) list.append(requestCard(row));
      details.append(list);
      fragment.append(details);
    }
    root.replaceChildren(fragment);
    if (focus === "selected")
      root.querySelector(".sc-selected-panel h3")?.focus();
    else if (focus === "date")
      root
        .querySelector(`.sc-date[data-date="${state.selected}"]`)
        ?.focus({ preventScroll: true });
    else if (focus)
      root
        .querySelector(`[data-sc-action="${focus}"]`)
        ?.focus({ preventScroll: true });
  }
  function choose(day, focus) {
    if (!parseServiceDate(day)) return;
    state.selected = day;
    render(focus);
  }
  const click = (event) => {
    const b = event.target.closest("[data-sc-action]");
    if (!b || !root.contains(b)) return;
    const action = b.dataset.scAction;
    if (action === "refresh") {
      onRefresh();
      return;
    }
    if (action === "date") {
      choose(
        b.dataset.date,
        b.classList.contains("sc-more") ? "selected" : "date",
      );
      return;
    }
    if (action === "event") {
      const row = state.rows.find((r) => String(r.key) === b.dataset.key);
      if (row?.date) choose(row.date, "selected");
      return;
    }
    if (action === "today") {
      choose(malaysiaToday(now()), "today");
      return;
    }
    if (["month", "week"].includes(action)) {
      state.view = action;
      render(action);
      return;
    }
    const amount = action === "previous" ? -1 : 1;
    choose(
      state.view === "month"
        ? shiftServiceMonth(state.selected, amount)
        : addServiceDays(state.selected, 7 * amount),
      action,
    );
  };
  const keydown = (event) => {
    const b = event.target.closest(".sc-date");
    if (!b) return;
    let day = null;
    if (event.key === "ArrowLeft") day = addServiceDays(b.dataset.date, -1);
    else if (event.key === "ArrowRight")
      day = addServiceDays(b.dataset.date, 1);
    else if (event.key === "ArrowUp") day = addServiceDays(b.dataset.date, -7);
    else if (event.key === "ArrowDown") day = addServiceDays(b.dataset.date, 7);
    else if (event.key === "Home")
      day = addServiceDays(
        b.dataset.date,
        -((parseServiceDate(b.dataset.date).getUTCDay() + 6) % 7),
      );
    else if (event.key === "End")
      day = addServiceDays(
        b.dataset.date,
        6 - ((parseServiceDate(b.dataset.date).getUTCDay() + 6) % 7),
      );
    else if (event.key === "PageUp" || event.key === "PageDown")
      day =
        state.view === "month"
          ? shiftServiceMonth(b.dataset.date, event.key === "PageUp" ? -1 : 1)
          : addServiceDays(b.dataset.date, event.key === "PageUp" ? -7 : 7);
    if (day) {
      event.preventDefault();
      choose(day, "date");
    }
  };
  root.addEventListener("click", click);
  root.addEventListener("keydown", keydown);
  render();
  return {
    setRequests(rows) {
      state.rows = (Array.isArray(rows) ? rows : [])
        .filter((row) => row && typeof row === "object")
        .map((row, key) => ({
          key,
          id: typeof row.id === "string" ? row.id : "",
          title:
            typeof row.title === "string" && row.title.trim()
              ? row.title
              : "Service request",
          category: typeof row.category === "string" ? row.category : "",
          status: row.status,
          date: parseServiceDate(row.date) ? row.date : null,
          time: serviceTime(row.time),
          area: typeof row.area === "string" ? row.area : "",
          href: safeWorkflow(row.href),
          actionLabel:
            typeof row.actionLabel === "string" ? row.actionLabel : "",
        }));
      state.hasData = true;
      state.error = false;
      state.loading = false;
      render(
        restoreRefreshFocus && document.activeElement === document.body
          ? "refresh"
          : null,
      );
      restoreRefreshFocus = false;
    },
    setLoading() {
      restoreRefreshFocus =
        root.contains(document.activeElement) &&
        document.activeElement.dataset.scAction === "refresh";
      state.loading = true;
      state.error = false;
      render();
    },
    setError() {
      state.loading = false;
      state.error = true;
      render(
        restoreRefreshFocus && document.activeElement === document.body
          ? "refresh"
          : null,
      );
      restoreRefreshFocus = false;
    },
    destroy() {
      stopped = true;
      root.removeEventListener("click", click);
      root.removeEventListener("keydown", keydown);
    },
  };
}
