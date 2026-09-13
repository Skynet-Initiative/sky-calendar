# Manifeste Sky Calendar

- Audience : `sky-calendar`.
- Ressource : `workspace`, identifiant opaque ASCII de 1 à 128 caractères (`A-Z`, `a-z`, `0-9`,
  `_`, `-`). Un workspace possède ses calendriers et événements.
- Actions : `read` pour les listes, `manage` pour les mutations. Le contrôle hôte d'une mutation
  doit émettre son audit de domaine ; `actor` reste un identifiant d'audit et n'autorise rien.
- Plan utilisateur : API privée uniquement, derrière le gateway Skynet. Aucun plan public.
- Isolation : chaque requête SQL porte `workspace_id` dans son prédicat ; les mutations par ID le
  vérifient atomiquement. Les tokens Ed25519 sont vérifiés hors ligne, avec rotation par liste de
  clés.
- Cycle de vie : création paresseuse au premier calendrier et purge idempotente du workspace par
  le plan de contrôle privé lors de la suppression définitive du projet hôte.
- Rétention : conservation tant que le projet existe ; la purge supprime les calendriers et, par
  cascade PostgreSQL, tous leurs événements.
- Décision : le workspace est la granularité de ressource afin que le gateway puisse dériver un
  ensemble stable depuis les appartenances sans exposer d'organisation ou d'utilisateur.
