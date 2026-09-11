# Todo App

A web application created for DevOps with Kubernetes Exercise 2.2.

## Description

Displays a random image from [Lorem Picsum](https://picsum.photos/1200) with a 10-minute cache.

Fetches todos from the `todo-backend` service via `GET http://todo-backend:3000/todos` on each page load and renders them server-side. New todos are submitted via an HTML form (`POST /todos`), which the app proxies to the backend before redirecting back to `/`.

## Running Locally

Install dependencies:

```bash
npm install