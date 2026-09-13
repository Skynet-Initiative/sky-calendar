# Security policy

Signalez confidentiellement toute vulnérabilité à `security@skynet-initiative.com`. Ne placez
aucun secret, jeton, donnée d'agenda ou information personnelle dans un ticket public.

L'API est privée sauf `/api/v1/health/live` et `/api/v1/health/ready`. Elle vérifie la signature
EdDSA, l'audience, l'expiration, l'action et le workspace de chaque requête. Les
données restent dans PostgreSQL ; aucun tracker ou service d'observabilité tiers n'est chargé par
défaut.
