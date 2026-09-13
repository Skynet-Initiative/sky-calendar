# @skynet-initiative/sky-calendar

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
