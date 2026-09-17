# Manwha Tracker

Suivi personnel de manhwa, manhua, webcomics et light novels — notes /20, chapitres, tier list, covers auto.

## Fonctionnalités

- **CRUD** : titre, type, note /20, statut, chapitre, commentaire, résumé
- **Recherche** : Webtoon, NovelFire (LN), AniList, MangaDex — autocomplete avec sections
- **Cover** : téléchargement auto ou upload manuel (fichier / URL)
- **Tier list** intégrée (style TierMaker) : S+ → F selon la note
- **Vue grille** avec filtres statut / type

## Stack

| Couche | Techno |
|--------|--------|
| Frontend | React, Vite, Tailwind CSS 4 |
| Backend | Express, Node 22 |
| BDD | SQLite (`better-sqlite3`) |
| Déploiement | Docker Compose |

## Démarrage rapide (Docker)

```bash
git clone https://github.com/YOUR_USERNAME/manwha-tracker.git
cd manwha-tracker
docker compose up -d --build
```

→ http://localhost:8090

Les données (SQLite + covers) sont dans le volume Docker `manwha-data`.

## Dev local

```bash
# Terminal 1 — API
cd backend
npm install
mkdir -p data
DATA_DIR=./data npm run dev

# Terminal 2 — UI (proxy /api et /covers vers :3000)
cd frontend
npm install
npm run dev
```

→ http://localhost:5173

## API

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Santé |
| GET | `/api/search?q=` | Recherche fusionnée |
| GET | `/api/manhwa` | Liste |
| POST | `/api/manhwa` | Créer |
| PUT | `/api/manhwa/:id` | Modifier |
| DELETE | `/api/manhwa/:id` | Supprimer |
| GET | `/covers/:file` | Couvertures locales |

## Barème tier list

| Note /20 | Rang |
|----------|------|
| 0–5 | F |
| 6–8 | E |
| 9–11 | D |
| 12–13 | C |
| 14–15 | B |
| 16–17 | A |
| 18 | S |
| 19–20 | S+ |

## Import batch (optionnel)

Copie `backend/import-data.example.json` → `backend/import-data.json`, édite ta liste, puis :

```bash
# Conteneur Docker
docker cp backend/import-data.json manwha-tracker:/tmp/import-data.json
docker cp backend/import.mjs manwha-tracker:/tmp/import.mjs
docker exec -e BASE_URL=http://127.0.0.1:3000 manwha-tracker node /tmp/import.mjs /tmp/import-data.json

# Dev local (API sur :3000)
node backend/import.mjs backend/import-data.json
```

## Scripts utilitaires

| Script | Rôle |
|--------|------|
| `backend/import.mjs` | Import depuis JSON |
| `backend/enrich-metadata.mjs` | Backfill covers + résumés |
| `backend/cleanup.mjs` | Dédoublonnage |

## Sources de métadonnées

Pas d’API officielle Webtoon / NovelFire — scraping d’endpoints internes (`search-webtoon.js`, `search-novelfire.js`). AniList et MangaDex via leurs API publiques.

## Licence

Usage perso / self-hosted. Pas d’auth intégrée — ne pas exposer sur Internet sans reverse proxy + authentification.
