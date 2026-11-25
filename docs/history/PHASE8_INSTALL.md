# Unified Phase 8 overlay

This archive is an overlay for the existing `sooru-mvp` repository. It does not include `.git`.

From the extracted `sooru-phase8` directory, copy its contents into the repository root (preserve existing `.git`):

```bash
cp -R sooru-phase8/. ~/Downloads/sooru-mvp/
cd ~/Downloads/sooru-mvp
```

Then rebuild:

```bash
docker compose up --build
```

Backend smoke suite:

```bash
cd backend
python -m pytest -q
```

Frontend dependencies are installed inside the Docker build. A local `npm install` may be needed if building outside Docker.

This phase introduces new tables that SQLAlchemy `create_all` creates on startup. Existing tables are not dropped. Keep your Docker database volume.
