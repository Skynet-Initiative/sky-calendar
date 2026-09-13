# Cartographie des traitements

| Élément                   | Décision                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Finalité                  | Planification partagée dans un workspace Skynet                                                             |
| Données                   | Titres, descriptions, lieux, horaires, fuseaux, récurrence, statut et courriels d'invités                   |
| Source                    | Utilisateurs autorisés du workspace via le gateway Skynet                                                   |
| Personnes                 | Membres et invités nommés dans un événement                                                                 |
| Destinataires             | Membres disposant d'un grant `read` ou `manage` sur le workspace                                            |
| Sous-traitants/transferts | Aucun par défaut ; PostgreSQL du package uniquement                                                         |
| Base légale               | À définir par le responsable de traitement selon le déploiement                                             |
| Conservation              | Durée de vie du workspace ; purge administrative requise avant production                                   |
| Sécurité                  | JWT Ed25519 court, isolation SQL par workspace, TLS au reverse proxy, données absentes des logs             |
| Droits                    | Export ICS/CSV disponible ; rectification via API ; purge et suppression complète à livrer avant production |

Cette cartographie est en version initiale. Les bases légales, durées chiffrées et procédures de
droits doivent être arrêtées par le responsable de traitement avant toute donnée réelle.
