# VMC Card (FR)

Carte Home Assistant pour une **VMC deux vitesses** pilotée par un relais (inverseur : relais coupé = vitesse 1, relais collé = vitesse 2) :

- vitesse en cours avec ventilateur animé (lent en vitesse 1, rapide en vitesse 2) et photo de la VMC ;
- raison de la vitesse 2 : bouton de relance (avec compte à rebours) ou humidité (pièce concernée) ;
- bouton « Vitesse 2 · 30 min », « Relancer 30 min » et « Revenir en vitesse 1 » ;
- humidité des pièces surveillées : valeur, moyenne sur 24 h et seuil de passage en vitesse 2 ;
- réglage de l'écart d'humidité et du seuil absolu (+ / −) ;
- consommation du circuit (facultatif).

Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.

## Installation (HACS)
HACS → ⋮ → Dépôts personnalisés → l'URL de ce dépôt, catégorie **Tableau de bord**, puis Ctrl+Maj+R.

La photo d'exemple (`images/vmc-aldes.png`, VMC Aldes EasyHOME détourée) est à copier dans `/config/www/image/`.

## Exemple
```yaml
type: custom:vmc-card
name: VMC
image: /local/image/vmc-aldes.png
```

## Options
| Option | Défaut | Description |
|---|---|---|
| `relay_entity` | `switch.dingtian_relay57239_switch7` | Relais de la vitesse 2 (allumé = vitesse 2) |
| `timer_entity` | `timer.vmc_grande_vitesse` | Minuteur lancé par le bouton (30 min) |
| `humidity_entity` | `binary_sensor.vmc_humidite_elevee` | Capteur « humidité élevée » (attribut `pieces`) |
| `trigger_entity` | `binary_sensor.vmc_humidite_au_dessus_du_seuil` | Même condition sans temporisation : sert au compte à rebours après la baisse d'humidité |
| `delay_off` | `10` | Minutes de maintien en vitesse 2 après la baisse (= `delay_off` du capteur « humidité élevée ») |
| `max_hours` | `3` | Durée maximale de la vitesse 2 sur humidité |
| `power_entity` | `sensor.esp_tableau_divers_puissance` | Puissance du circuit (facultatif) |
| `gap_entity` | `input_number.vmc_ecart_humidite` | Écart au-dessus de la moyenne 24 h qui déclenche la vitesse 2 |
| `max_entity` | `input_number.vmc_seuil_humidite_max` | Seuil absolu |
| `rooms` | salle de bain, cuisine, suite | Liste de `{ name, humidity, mean }` (sonde d'humidité et sa moyenne 24 h) |
| `image` | | Photo de la VMC (fond transparent conseillé) |
| `show_settings` | `true` | Afficher les réglages d'écart et de seuil |
| `theme` | `auto` | `auto`, `light`, `dark` |

Le bloc « Nuance de couleur » est identique à celui des autres cartes.

La logique (minuteur, moyennes 24 h, capteur d'humidité élevée, commande du relais) est dans le package Home Assistant `vmc.yaml` qui accompagne la carte.
