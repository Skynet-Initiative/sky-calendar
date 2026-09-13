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
- Cycle de vie initial : création paresseuse au premier calendrier. La suspension et la purge
  administrative restent à implémenter avant raccordement en production.
- Rétention : conservation tant que le workspace existe. Aucun effacement automatique avant la
  mise en place du control plane ; une purge PostgreSQL validée doit précéder toute production.
- Décision : le workspace est la granularité de ressource afin que le gateway puisse dériver un
  ensemble stable depuis les appartenances sans exposer d'organisation ou d'utilisateur.
