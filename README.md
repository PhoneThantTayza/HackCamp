# HackCamp

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. The client entry is currently empty, so the page
will be blank until the UI is added.

Express handles `/api/*` requests, and vite-express serves the client on the
same port. Vite updates the client during development; nodemon restarts the
server when server code changes. Run commands from the project root.

## Check the server

```sh
curl.exe http://localhost:3000/api/health
```

Expected JSON: `{"status":"ok"}`. An unknown API route returns HTTP 404
with `{"error":"API route not found"}`.

The UI can call this endpoint with `fetch("/api/health")`; no separate API
hostname or CORS setup is needed. Page extraction is not implemented yet.

## Build and run production mode

```sh
npm run build
npm start
```

The start command works in PowerShell and serves the built `dist` directory.
Set the `PORT` environment variable to change the default port of 3000.
`npm run dev:client` runs Vite alone and does not start the API.
