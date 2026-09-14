# Todo App

A web application created for DevOps with Kubernetes Exercise 2.2.

## Description

Displays a random image from [Lorem Picsum](https://picsum.photos/1200) with a 10-minute cache.

Fetches todos from the `todo-backend` service via `GET http://todo-backend:3000/todos` on each page load and renders them server-side. New todos are submitted via an HTML form (`POST /todos`), which the app proxies to the backend before redirecting back to `/`.

Each todo that is not done has a **Mark done** button (Exercise 4.5). HTML forms cannot send PUT requests, so the button uses `fetch` to send `PUT /todos/:id` with `{ "done": true }`; the app forwards the request to the backend's `PUT /todos/:id` and the page reloads. Done todos are shown struck through with a "Done" label.

## Running Locally

Install dependencies:

```bash
npm install