# Todo Backend

A web service created for DevOps with Kubernetes Exercise 2.2.

## Description

Provides a REST API for managing todo items (stored in a PostgreSQL database since Exercise 2.8).

Database connection settings are read from the `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` environment variables.

- `GET /todos` — returns the list of all todos as JSON.
- `POST /todos` — creates a new todo. Requires a JSON body `{ "content": "..." }`. Content must be ≤ 140 characters.

## Run Locally

Install dependencies:

```bash
npm install
```

Run:

```bash
node index.js
```
