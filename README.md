# Sky Calendar

Package calendrier autonome de Skynet Initiative, basé sur le noyau MIT
[`ascentspark/react-calendar`](https://github.com/ascentspark/react-calendar) au commit
`39041349e5ab0ac54202ffd17193b6860696a8b1`.

## Stack

- Bun 1.3.14 et workspaces sans orchestrateur supplémentaire.
- Next.js 16.3.5, React 19.2.7 et TypeScript 6 strict pour la console de référence.
- NestJS 11.1.24 sur Fastify 5.12.4 pour l'API.
- PostgreSQL avec le pilote `pg`, comme Ecosystem, pour le stockage propre au package.
- Contrats Zod partagés, Vitest, ESLint et Prettier alignés sur Ecosystem.

## Architecture

```text
apps/backend         API privée NestJS/Fastify
packages/contracts   contrats réseau et types partagés
packages/react-calendar  vues et calculs calendrier headless
```

L'API n'accepte que des JWT EdDSA émis par la plateforme et vérifiés hors ligne par une liste de
clés publiques locales. Le jeton suit le profil adopté (`aud`, `exp`, `iat`, `scope`, `actor`) et
porte des grants `read:workspace:<id>` ou `manage:workspace:<id>`. L'identifiant présent dans l'URL
ne donne aucune autorité à lui seul.

Le noyau fournit les vues mois, semaine, jour, année, agenda et ressources, les fuseaux IANA,
la récurrence RFC 5545, les exceptions, l'export ICS/CSV, le glisser-redimensionner tactile et
clavier et des primitives de détection de conflits. Les événements restent immuables dans la
bibliothèque : l'hôte reçoit une proposition de changement et décide de la persister.

L'entrée `@skynet-initiative/sky-calendar/product` est sans composant : les types transportés
(`ProductCalendar`, `ProductEvent`, `ProductEventInput`…) et l'arithmétique d'un écran de
calendrier (brouillon, périodes visibles, déplacement d'une série). **L'écran vit chez l'hôte** :
Ecosystem le construit avec ses propres composants sur les vues de l'entrée principale
(`CalMonthView`, `CalTimeGridView`, `CalAgendaView`), dont les jetons `--cal-*` sont reliés aux
variables du thème hôte. Le CSS publié par `@skynet-initiative/sky-calendar/styles.css` ne porte
que ces vues.

Ecosystem conserve uniquement son adaptateur BFF. Skynet v2 vérifie le projet et les droits,
dérive un workspace opaque, puis émet un jeton court limité à `read` ou `manage`. Lors de la
purge d'un projet, son plan de contrôle appelle `DELETE /api/v1/control/workspaces/:workspaceId`;
ce point d'entrée idempotent exige `CONTROL_PLANE_TOKEN`.

## Développement

```sh
cp .env.example .env
bun install --frozen-lockfile
docker compose up -d postgres
bun run db:migrate
bun run dev
```

API : `http://localhost:4010/api/v1`.

## Qualité

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

## Licence et provenance

MIT. Le copyright et la licence amont sont conservés dans `LICENSE`. Les documents amont
originaux sont archivés dans `docs/UPSTREAM_*`; voir aussi `THIRD-PARTY-NOTICES.md`.
