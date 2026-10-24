# MUWCI 24H Race

A real-time race-management dashboard for the MUWCI 24 Hour Race.

## What it supports

- A 24-hour countdown and fixed race start time
- Up to 13 teams and roughly 130 runners
- Team and runner management
- Lap recording and correction
- Live leaderboard, distance, average pace, and projections
- Public read-only race display
- Protected administrator controls
- Real-time synchronization through Cloud Firestore

## Administrator access

Open the Admin panel, enter the event PIN, and complete the authorized Google sign-in. Only the configured race administrator account can write to the shared race data.

## Local testing

Serve this directory from a local web server. Firebase's reserved `/__/firebase/init.json` endpoint is supplied automatically on Firebase Hosting; for local development, use the Firebase Hosting emulator so the same configuration endpoint is available.

## Deployment

The project uses Firebase Hosting, Authentication, and Cloud Firestore. Its deployment configuration is in `firebase.json`, and the database access policy is in `firestore.rules`.

Do not add Firebase service-account credentials, access tokens, or private keys to this repository.
