# Todo App

A web application created for DevOps with Kubernetes Exercise 1.12.

## Description

Displays a random image from [Lorem Picsum](https://picsum.photos/1200) with a 10-minute cache.

- On the first request (or after 10 minutes), a new image is downloaded from `https://picsum.photos/1200` and saved to a PersistentVolume at `/app/files/image.jpg`.
- Subsequent requests within the 10-minute window serve the cached image directly from the PV.
- The cache survives Pod restarts because it is stored on a PersistentVolumeClaim (`todo-pvc`).

## Running Locally

Install dependencies:

```bash
npm install