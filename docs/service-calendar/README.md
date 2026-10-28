# Service Calendar — frontend draft

Branch: feat/service-calendar. Base: igotu-staging-validation at dd13352e31d6a53251baf501181a657882d840f0. This feature uses HTML/CSS/JavaScript and the current dashboard data contracts. No new tables, SQL, migrations, Auth/identity/role-guard changes, production calls or deploy are included.

## Behavior

Both dashboards now show a green-and-white monthly calendar between statistics and the existing request panel. Monday-first dates have shape/text indicators for preferred/unconfirmed, confirmed/in-progress, completed and cancelled services. The selected date lists title, requested wall time, current status and a link to the appropriate existing page. Month/Today controls, loading/error/retry/empty states and responsive layouts are included.

Client data still comes from the existing service_requests query filtered by client_id. Provider data still comes exclusively from backend-access.js providerRequests(null), which invokes the caller-scoped provider_service_requests RPC; the Provider never queries the request table or browses open requests. Additional UI ownership/status filtering is defense in depth, not database authorization. The calendar only renders after existing authorizeWorkspace/profile checks succeed. It has no compatibility bypass, fallback query, write action or synthetic-data switch in shipped code.

Existing dashboard loaders supply both stats/request panels and the calendar in one refresh. Manual refresh, window focus/pageshow, visible-tab return and a one-minute visible-page interval re-read current state. Errors clear calendar details rather than showing stale assignments. Confirmation changes the preferred marker; decline clears the Provider assignment and removes the item on refresh while the Client request returns to pending/preferred. No new decline or matching protocol is introduced. This is periodic refresh, not push/Realtime; updates can remain visible until the next successful refresh.

Provider awaiting-confirmation entries link to Incoming Requests; confirmed/in-progress/completed entries link to Assignments. Destination pages retain their complete caller-authorized lists and existing actions. After loading, a valid request_id is matched only against those returned rows; the matching card receives a Selected service label, keyboard focus and a scroll into view. Missing, malformed, duplicate, unavailable or unauthorized IDs are ignored without a lookup. The parameter never enters an RPC argument, table query or interpolated CSS selector. Cancelled Provider entries display inline without a misleading action link. Client entries link to request details. The inline detail list deliberately omits participant contact/location fields withheld by the RPC.

The stored fields are preferred_date (date), preferred_time (time without time zone), status, client_id and selected_provider_id. No confirmed-date field exists. Confirmed markers mean the current status confirms the existing requested slot, not an invented appointment timestamp or duration. Date strings are validated and parsed as local wall dates; time strings are displayed without timezone conversion. Invalid dates are omitted with a notice. Keyboard controls use roving date buttons: arrows by day/week, Home/End by week, Page Up/Down by month, native Enter/Space selection, normal Tab for toolbar/detail links. Focus/selected/today indicators and text labels accompany markers.

## Local synthetic verification

```sh
npm ci --prefix tests
npm --prefix tests run test:calendar
```

The standalone test starts a loopback-only server, replaces supabaseClient.js with the existing stateful fixture transport and aborts external requests. No live project keys, production data or real accounts are needed. Chromium defaults to /usr/bin/chromium; CHROMIUM_PATH may select an installed local executable.

28 browser scenarios plus date/ownership model checks cover scoped Client/Provider loading, status/decline transitions, read-only links, stale-detail removal/error recovery, empty/loading states, duplicate refresh suppression, automatic refresh, keyboard/month/year/Today navigation, backend-compatibility and mandatory identity denial, escaped/encoded untrusted fields, and layout/axe accessibility at 320/390/1440 pixels across Honolulu, Kuala Lumpur and Kiritimati. Results and screenshots are written to ignored work/service-calendar. The main audit runner also includes this suite.

Screenshots contain synthetic data only: [mobile](calendar-390.png), [desktop](calendar-1440.png).

## Backend approval boundary and limits

D03/D04 remain unfinished/unapproved for execution. Current staging may remain locked by the existing backend contract/identity guard; this PR does not unlock it. The mocks verify frontend contracts and fail-closed UI behavior, not real RLS, RPC deployment compatibility, returned row completeness or status transactions. Live integration must wait for explicit backend/test approval. The calendar inherits existing dashboard API response limits/pagination behavior; verify completeness for large service histories during approved backend integration rather than assuming mocked rows establish it. No Realtime publications, SQL grants, default privileges or policy changes are needed or included.

Final synthetic regression results: 28 calendar/destination browser scenarios, 94 existing functional cases, 84 existing layout checks, and the mandatory-verification suite PASS. Offline backend-bundle hashes PASS; authorization, identity, backend access and Supabase client configuration files remain byte-identical to the base. See [validation record](validation.json).
