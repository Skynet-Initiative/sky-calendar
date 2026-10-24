# @skynet-initiative/sky-calendar

## Product layer

`@skynet-initiative/sky-calendar/product` is headless: the data types a host
transports (`ProductCalendar`, `ProductEvent`, `ProductEventInput`) and the
arithmetic a calendar screen needs (event drafts that keep guest answers, the
inclusive all-day end, visible periods per view, moving a series from one of its
occurrences). The screen itself belongs to the host, built with its own design
system on the views below; Ecosystem is the reference host.

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
