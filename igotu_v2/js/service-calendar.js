// Read-only view of dashboard data. Authorization stays in the existing guard,
// Client owner query and Provider caller-scoped RPC; there is no query fallback.
const confirmed = new Set(["confirmed", "in_progress", "completed"]);
const assigned = new Set(["provider_selected", ...confirmed, "cancelled"]);
const statuses = {
  pending: "Pending provider selection",
  provider_selected: "Awaiting provider confirmation",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const dayFormat = new Intl.DateTimeFormat("en", { dateStyle: "full" });
const monthFormat = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

export function dateKey(date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseServiceDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // PostgreSQL date/time-without-time-zone fields are wall dates/times, not UTC.
  const date = new Date(year, month - 1, day, 12);
  return dateKey(date) === value ? date : null;
}

export function calendarRequests(rows, role, userId) {
  if (!Array.isArray(rows)) throw new Error("Invalid service response");
  if (!["client", "provider"].includes(role) || !userId) return [];
  return rows.filter((row) => row && typeof row.request_id === "string" && (
    role === "client" ? row.client_id === userId :
      row.selected_provider_id === userId && assigned.has(row.status)
  ));
}

export function serviceTiming(status) {
  if (status === "cancelled") return "Cancelled · not scheduled";
  if (status === "completed") return "Completed service";
  return confirmed.has(status) ? "Confirmed date" : "Preferred date · unconfirmed";
}

function timeLabel(value) {
  if (typeof value !== "string") return "Time not set";
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1]}:${match[2]}` : "Time not set";
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountServiceCalendar(root, { role, userId, loadRequests }) {
  if (!root) return null;
  const today = () => new Date();
  let selected = dateKey(today());
  let month = new Date(today().getFullYear(), today().getMonth(), 1, 12);
  let rows = [];
  let loading = false;
  let failed = false;
  let destroyed = false;
  const title = element("h2", "", "Service Calendar");
  title.id = "serviceCalendarTitle";
  const intro = element("p", "calendar-intro", role === "client" ?
    "Your requests, from preferred dates to completed services." :
    "Only your assigned services, including those awaiting your confirmation.");
  const header = element("div", "calendar-header");
  const heading = element("div");
  heading.append(title, intro);
  const refreshButton = element("button", "btn btn-outline", "Refresh services");
  refreshButton.type = "button";
  header.append(heading, refreshButton);
  const toolbar = element("div", "calendar-toolbar");
  const previous = element("button", "calendar-nav", "‹");
  const next = element("button", "calendar-nav", "›");
  const todayButton = element("button", "calendar-today", "Today");
  const monthLabel = element("h3", "calendar-month");
  monthLabel.id = "serviceCalendarMonth";
  for (const button of [previous, next, todayButton]) button.type = "button";
  previous.setAttribute("aria-label", "Previous month");
  next.setAttribute("aria-label", "Next month");
  toolbar.append(previous, monthLabel, next, todayButton);
  const legend = element("p", "calendar-legend", "○ Preferred / unconfirmed   ● Confirmed / in progress   ✓ Completed   × Cancelled");
  const instructions = element("p", "calendar-help", "Choose a date. Use arrow keys to move by day or week, Home/End for the week, and Page Up/Page Down for months.");
  instructions.id = "serviceCalendarHelp";
  const status = element("p", "calendar-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const content = element("div", "calendar-content");
  const table = element("table", "calendar-table");
  table.setAttribute("aria-labelledby", monthLabel.id);
  table.setAttribute("aria-describedby", instructions.id);
  const head = element("thead");
  const weekdays = element("tr");
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    const th = element("th", "", day);
    th.scope = "col";
    weekdays.append(th);
  }
  head.append(weekdays);
  const body = element("tbody");
  table.append(head, body);
  const details = element("section", "calendar-details");
  details.setAttribute("aria-labelledby", "serviceCalendarDay");
  content.append(table, details);
  root.setAttribute("aria-labelledby", title.id);
  root.replaceChildren(header, toolbar, legend, instructions, status, content,
    element("p", "calendar-help", "Dates and times are shown as requested, without timezone conversion. Updates when you return or refresh, and every minute while this page is visible."));

  function selectDate(date, focus = false) {
    if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return;
    selected = dateKey(date);
    month = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    render();
    if (focus) body.querySelector(`[data-date="${selected}"]`)?.focus();
  }

  function changeMonth(offset, focus = false) {
    const date = parseServiceDate(selected);
    const target = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
    target.setDate(Math.min(date.getDate(), lastDay));
    selectDate(target, focus);
  }

  function render() {
    monthLabel.textContent = monthFormat.format(month);
    previous.disabled = month.getFullYear() === 1000 && month.getMonth() === 0;
    next.disabled = month.getFullYear() === 9999 && month.getMonth() === 11;
    const byDate = new Map();
    let undated = 0;
    for (const row of rows) {
      if (!parseServiceDate(row.preferred_date)) { undated++; continue; }
      if (!byDate.has(row.preferred_date)) byDate.set(row.preferred_date, []);
      byDate.get(row.preferred_date).push(row);
    }
    body.replaceChildren();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const start = (month.getDay() + 6) % 7;
    let count = 0;
    for (let week = 0; week < 6; week++) {
      const tr = element("tr");
      for (let weekday = 0; weekday < 7; weekday++) {
        const day = week * 7 + weekday - start + 1;
        const td = element("td");
        if (day > 0 && day <= days) {
          const date = new Date(month.getFullYear(), month.getMonth(), day, 12);
          const key = dateKey(date);
          const services = byDate.get(key) || [];
          count += services.length;
          const button = element("button", "calendar-day");
          button.type = "button";
          button.dataset.date = key;
          button.tabIndex = key === selected ? 0 : -1;
          button.setAttribute("aria-pressed", String(key === selected));
          if (key === dateKey(today())) button.setAttribute("aria-current", "date");
          const types = [...new Set(services.map((s) => serviceTiming(s.status)))];
          button.setAttribute("aria-label", `${dayFormat.format(date)}. ${services.length} service${services.length === 1 ? "" : "s"}${types.length ? ". " + types.join("; ") : ""}`);
          button.append(element("span", "calendar-day-number", String(day)));
          const markers = element("span", "calendar-markers");
          markers.setAttribute("aria-hidden", "true");
          for (const [symbol, matches, style] of [
            ["○", (s) => !confirmed.has(s.status) && s.status !== "cancelled", "preferred"],
            ["●", (s) => ["confirmed", "in_progress"].includes(s.status), "confirmed"],
            ["✓", (s) => s.status === "completed", "completed"],
            ["×", (s) => s.status === "cancelled", "cancelled"],
          ]) if (services.some(matches)) markers.append(element("span", `calendar-marker ${style}`, symbol));
          button.append(markers);
          if (services.length) button.classList.add("has-services");
          td.append(button);
        }
        tr.append(td);
      }
      body.append(tr);
    }
    details.replaceChildren();
    const dayTitle = element("h3", "", dayFormat.format(parseServiceDate(selected)));
    dayTitle.id = "serviceCalendarDay";
    details.append(dayTitle);
    const services = [...(byDate.get(selected) || [])].sort((a, b) => String(a.preferred_time || "").localeCompare(String(b.preferred_time || "")) || a.request_id.localeCompare(b.request_id));
    if (!services.length) details.append(element("p", "muted-text", role === "provider" ? "No assigned services on this date." : "No service requests on this date."));
    const list = element("ul", "calendar-service-list");
    for (const service of services) {
      const item = element("li", "calendar-service");
      item.dataset.requestId = service.request_id;
      const canOpen = role === "client" || service.status !== "cancelled";
      const link = element(canOpen ? "a" : "strong", "calendar-service-title", service.title || "Untitled service");
      if (canOpen) {
        const destination = role === "client" ? "request-details" : service.status === "provider_selected" ? "incoming-requests" : "assignment-details";
        link.href = `${destination}.html?request_id=${encodeURIComponent(service.request_id)}`;
      }
      item.append(link, element("p", "calendar-service-time", `${timeLabel(service.preferred_time)} · ${serviceTiming(service.status)}`), element("p", "calendar-service-status", statuses[service.status] || "Status unavailable"));
      // No contact, location, or other fields withheld by Provider RPC redaction.
      list.append(item);
    }
    details.append(list);
    if (!loading && !failed) status.textContent = `${count ? `${count} service${count === 1 ? "" : "s"}` : role === "provider" ? "No assigned services" : "No service requests"} this month.${undated ? ` ${undated} request(s) have unavailable dates and are not shown.` : ""}`;
  }

  async function refresh() {
    if (loading || destroyed) return;
    const focusedDate = body.contains(document.activeElement) ? document.activeElement.dataset.date : null;
    loading = true;
    failed = false;
    rows = [];
    content.hidden = true;
    root.setAttribute("aria-busy", "true");
    refreshButton.disabled = true;
    status.textContent = "Loading services…";
    try {
      const result = await loadRequests();
      if (destroyed) return;
      rows = calendarRequests(result, role, userId);
    } catch {
      if (destroyed) return;
      failed = true;
      status.textContent = "Services could not be loaded. Select Refresh services to try again.";
    } finally {
      loading = false;
      if (!destroyed) {
        root.setAttribute("aria-busy", "false");
        refreshButton.disabled = false;
        content.hidden = failed;
        render();
        if (!failed && focusedDate && document.activeElement === document.body) {
          body.querySelector(`[data-date="${focusedDate}"]`)?.focus();
        }
      }
    }
  }

  body.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (button) selectDate(parseServiceDate(button.dataset.date), true);
  });
  body.addEventListener("keydown", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    const date = parseServiceDate(button.dataset.date);
    const weekday = (date.getDay() + 6) % 7;
    const shifts = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
    if (Object.hasOwn(shifts, event.key)) {
      event.preventDefault();
      date.setDate(date.getDate() + shifts[event.key]);
      selectDate(date, true);
    } else if (["PageUp", "PageDown"].includes(event.key)) {
      event.preventDefault();
      changeMonth(event.key === "PageUp" ? -1 : 1, true);
    }
  });
  previous.addEventListener("click", () => changeMonth(-1));
  next.addEventListener("click", () => changeMonth(1));
  todayButton.addEventListener("click", () => selectDate(today()));
  refreshButton.addEventListener("click", refresh);
  const onVisible = () => { if (!document.hidden) void refresh(); };
  window.addEventListener("focus", onVisible);
  window.addEventListener("pageshow", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  const interval = window.setInterval(onVisible, 60000);
  render();
  void refresh();
  return { refresh, destroy() {
    destroyed = true;
    window.clearInterval(interval);
    window.removeEventListener("focus", onVisible);
    window.removeEventListener("pageshow", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
    rows = [];
    root.replaceChildren();
  } };
}
