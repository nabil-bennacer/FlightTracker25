# FlightTracker25 by BENNACER Nabil

## Présentation du projet
FlightTracker25 est un site de suivi des vols en temps réel inspiré du très mondialement connu Flightradar24. Il permet de visualiser les avions en vol actuellement dans le monde sur une carte, de consulter les informations détaillées des vols, de rechercher des vols par numéro de vol, et de gérer ses vols favoris. Une section administration permet également de consulter les statistiques des utilisateurs.

## Cas d'utilisation
FlightTracker25 peut être utilisé dans de nombreux contextes de la vie réelle, par exemple :

### Utilisateur lambda
Un utilisateur curieux peut consulter en temps réel les avions qui survolent sa région. Il peut rechercher un vol en particulier (ex : un proche qui décolle ou atterrit) et suivre sa progression sur la carte. En se créant un compte, il peut même enregistrer ce vol dans ses favoris et le retrouver facilement après.

### Passionné d’aviation (spotter)
Un passionné d’aéronautique peut se servir de FlightTracker25 pour localiser des modèles d’avion rares. Grâce aux détails enrichis (modèle, compagnie, aéroports), il peut planifier ses séances de spotting plus efficacement.


## Fonctionnalités
- Connexion et inscription sécurisées (JWT + bcrypt).
- Suivi des vols en temps réel via WebSocket.
- Affichage des avions sur une carte interactive avec OpenLayers.
- Affichage de plus de 10000 aéroports récupérés depuis le fichier airports.csv.
- Recherche de vols par numéro de vol (ex : AFR123).
- Visualisation des détails de chaque vol (compagnie, modèle, départ, arrivée, heure de départ (UTC)....).
- Ajout et suppression de favoris.
- Section administration (réservée aux admins), permettant de voir les vols ajoutés et consultés par chaque utilisateur connecté.
- Possibilité de supprimer son compte (sauf pour le compte administrateur)


## Frontend : 
HTML, CSS, JavaScript
## Backend : 
Deno, Oak, WebSocket natif, JWT, bcrypt


## Base de données : SQLite (via @db/sqlite)
La base de données utilise SQLite avec les tables suivantes :

### `users`
Contient les informations d’identification des utilisateurs.
- `id` : identifiant unique
- `username` : nom d’utilisateur
- `email` : adresse mail
- `password_hash` : mot de passe hashé
- `role` : rôle de l’utilisateur (ex. : "user", "admin")

### `flights`
Contient des informations de base sur les vols enregistrés (favoris ou consultés).

### `logs`
Stocke les vols consultés par les utilisateurs connectés.

### `user_flights`
Table d'association entre un utilisateur et un vol.

### `airports`
Liste des aéroports connus pour affichage sur la carte.

## Utilisation des WebSockets

FlightTracker25 établit une connexion WebSocket sécurisée dès le chargement de la page d’accueil. Cette connexion permet au backend d’envoyer en continu les données des avions suivis, récupérées en temps réel depuis l’API OpenSky.

Le backend envoie régulièrement les positions mises à jour des avions visibles, sous forme de messages JSON contenant leurs coordonnées, cap, altitude, et numéro de vol. Ces données sont ensuite utilisées côté client pour mettre à jour la carte sans rechargement, en affichant ou en repositionnant les avions correspondants.

La connexion WebSocket est donc responsable de :
- transmettre en direct les données des avions à tous les utilisateurs.
- permettre un affichage fluide et sans interruption des mouvements aériens sur la carte.
- synchroniser les informations avec la position réelle de chaque appareil.

## API externes utilisées  : 
- OpenSky Network pour récupérer la position des vols en temps réel.
- AeroDataBox pour récupérer les détails sur les vols 
- planespotters.net pour récupérer les photos des avions et à placer dans le sidePanel.

## Difficultés rencontrées 
Un exemple de difficulté rencontré est lié à la limitation des API en termes de requêtes notamment
OpenSky et AeroDataBox qui sont très limitées. Ainsi si l'on adapte ce projet à une plus grande échelle, 
il sera necessaire de payer pour avoir accés à un plus grand nombre de requêtes fournies à l'API.

De plus, je voulais également faire intervenir une autre API qui est AMADEUS afin de récupérer une tranche du prix que pourrait couter un billet d'avion sur un vol en particulier. Cependant, elle s'est révélée instable et aucune autre API gratuite n'était accessible. Cette fonctionnalité a donc été retiré.

## Solutions trouvées
Pour limiter le nombre de requêtes à l'API OpenSky, un intervalle a été mis en place côté backend pour l'interroger toutes les 5 minutes. En pratique, l'utilisateur ne verra donc la position des avions s'actualiser sur la carte toutes les 5 minutes.

De plus, côté backend également un système de cache est utilisé pour optimiser les requêtes vers l’API externe AeroDataBox, utilisée pour enrichir les détails d’un vol.

## Informations à savoir  
- Dans la section admin, un tableau des vols consultés et mis en favoris par chaque users de FlighTracker25 est présenté. Cependant, celà est présent à titre d'exemple de section limité à un administrateur, car en réalité celà suscite des interrogations en matière de conformité au Règlement Général sur la Protection des Données (RGPD).

- Certains vols peuvent ne pas afficher le numéro de vol ou les détails (compagnie, modèle, horaires) car les API externes ne fournissent pas toujours toutes les informations. Ainsi, l'utilisation de Thunder Client a été pratique pour vérifier s'il s'agit d'erreur liée à l'API ou au code en lui même. 

- Les vols ajoutés aux favoris sont liés à leur identifiant (icao24). Lorsqu’un utilisateur clique sur un favori, l’application tente de localiser l’avion correspondant en temps réel. Il est donc normal que l'avion n'ai plus le même numéro de vol. En revanche, si l’avion n’est plus visible (vol terminé ou hors zone), une alerte est affichée. 

## Acceptation des certificats auto-signés
Le backend et le frontend de FlightTracker25 fonctionne en HTTPS avec un certificat auto-signé. Lors de la première connexion à https://localhost:8080, votre navigateur affichera probablement un avertissement de sécurité.

Que faire ?
Une fois le certificat accepté, actualisez manuellement la page.

Pourquoi l'actualisation est nécessaire ?

Même après avoir accepté le certificat, certains navigateurs ne valident pas immédiatement la connexion sécurisée pour les requêtes fetch ou WebSocket. Cela peut empêcher la communication avec le backend (ce qui peut causer erreurs CORS, des échecs de connexion WebSocket, etc.), ainsi rien ne va s'afficher sur la carte.

Une simple actualisation après acceptation permet de réinitialiser la session sécurisée et d’éviter ces problèmes.

## Ressources utilisées
- Depôt WOA du cours d'architecture WEB
- Stack Overflow pour de la documentation mais aussi corriger des erreurs connues.
- IA (Emojis, documentation js, corrections d'erreurs)


## Installation 
Une fois dans le dossier FlighTracker25 : 

cd backend/
deno run --allow-net --allow-read --allow-env --allow-ffi --unstable-ffi back_server.ts

cd frontend/ 
deno run --allow-net --allow-read server.ts

Dans votre navigateur : 
https://localhost:8080



