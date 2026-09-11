# Log Output

Exercise 1.10 – DevOps with Kubernetes.

## Description

The Log Output application is split into two containers running in the same Kubernetes Pod.

- **Generator container:** generates a random string on startup and writes the current timestamp and random string to `/shared-data/log.txt` every 5 seconds.
- **Log Output container:** reads the shared file and serves its contents through the HTTP GET endpoint `/`.

Both containers use a shared `emptyDir` volume.

## Run Locally

Build the image:

```bash
docker build -t parthvasave/log-output:1.10 .
```
