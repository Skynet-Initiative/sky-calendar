# @skynet-initiative/sky-calendar

## Product surface

`@skynet-initiative/sky-calendar/product` is the supported, batteries-included
calendar workspace used by Ecosystem, built on this package's own month,
time-grid and agenda views. It is mobile first: a narrow box opens in Agenda,
the week becomes three days, the built-in dialogs become bottom sheets, and
drag, resize and create follow the pointer on touch screens as well. It
manages calendars (create, rename, recolour, hide, delete), events with guests,
recurrence scope and an attached video call (`conference`), plus ICS/CSV export.
A host supplies its own `eventComposer` / `calendarComposer` components and
receives the draft, `editable` and `compact` to lay them out.

```tsx
import {
  SkyCalendarWorkspace,
  type SkyCalendarTransport,
} from "@skynet-initiative/sky-calendar/product";
import "@skynet-initiative/sky-calendar/styles.css";

export function CalendarPage({
  transport,
}: {
  transport: SkyCalendarTransport;
}) {
  return <SkyCalendarWorkspace transport={transport} timeZone="Europe/Paris" />;
}
```

The host implements `SkyCalendarTransport` (calendars: list, create, update,
delete; events: list, export, create, replace, delete). Keep authentication, entitlement
checks and package tokens in its server-side BFF; the browser transport only
calls same-origin authenticated routes. Date strings crossing the transport
are UTC ISO instants, while `timeZone` is an explicit IANA zone used for input,
display, recurrence and export.

Moteur React 19 de Sky Calendar : vues mois, semaine, jour, année, agenda et ressources,
récurrence RFC 5545, fuseaux IANA, interactions clavier/pointeur et exports.

```sh
bun add @skynet-initiative/sky-calendar date-fns date-fns-tz rrule
```

```tsx
import {
  CalendarProvider,
  CalMonthView,
  type CalendarEvent,
} from "@skynet-initiative/sky-calendar";
import { DateFnsDateAdapter } from "@skynet-initiative/sky-calendar/date-fns";
import "@skynet-initiative/sky-calendar/styles.css";

const adapter = new DateFnsDateAdapter();

export function Calendar({ events }: { events: readonly CalendarEvent[] }) {
  return (
    <CalendarProvider dateAdapter={adapter}>
      <CalMonthView events={events} viewDate={new Date()} />
    </CalendarProvider>
  );
}
```

Les événements sont immuables : les callbacks proposent un changement, l'application hôte le
valide et le persiste. Les adaptateurs de récurrence et les exports sont disponibles via
`/recurrence` et `/export`. Licence MIT ; dérivé d'Ascentspark React Calendar au commit indiqué
dans `THIRD-PARTY-NOTICES.md` du dépôt.
