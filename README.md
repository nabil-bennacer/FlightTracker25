# FlightTracker25 by BENNACER Nabil

## Présentation projet
FlightTracker25 est site de suivi des vols en temps réel inspirée de la très mondialement connue Flightradar24. Elle permet de visualiser les avions en vol actuellement dans le monde sur une carte interactive, de consulter les informations détaillées des vols, de rechercher des vols par numéro de vol, et de gérer ses vols favoris. Une section administration permet également de consulter les statistiques des utilisateurs.

## Cas d'utilisation
FlighTracher25 peut être très utile dans votre vie


## Fonctionnalités
- Connexion et inscription sécurisées (JWT + bcrypt).
- Suivi des vols en temps réel via WebSocket.
- Affichage des avions sur une carte interactive avec OpenLayers.
- Affichage de plus de 10000 aéroports récupérés depuis le fichier airports.csv.
- Recherche de vols par numéro de vol (ex : AFR123).
- Visualisation des détails de chaque vol (compagnie, modèle, départ, arrivée, heure de départ (UTC)....).
- Ajout et suppression de favoris.
- Interface d’administration (réservée aux admins), permettant de voir les vols ajoutés et consultés par chaque utilisateur connecté.


- **Frontend** : HTML, CSS, JavaScript
- **Backend** : Deno, Oak, WebSocket natif, JWT, bcrypt


## Base de données : SQLite (via @db/sqlite)
- 


- **API externes utilisées**  : 
- OpenSky Network pour récupérer la position des vols en temps réels.
- AeroDataBox pour récupérer les détails sur les vols 
- planespotters.net pour récupérer les photos des avions et les placer dans le sidePanel.

