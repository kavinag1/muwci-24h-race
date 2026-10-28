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
- Responsive Sand theme across the leaderboard, race controls, setup, gallery, and dialogs
- GIVE.asia campaign links for donations and the official live fundraising total

## Fundraising

The leaderboard links to the 24 Hour Race Mahindra 2026 campaign on GIVE.asia.
The official `/live` counter opens in a separate tab because GIVE.asia blocks
cross-origin embedding. The site does not scrape, cache, or invent donation totals.
An inline counter requires an official embeddable widget or supported data feed.

## Administrator access

Open the Admin panel and enter the event PIN. Successful PIN entry opens the Setup screen immediately; no account sign-in is required. The PIN is verified by a Cloud Function and is never stored in the website files or Firestore.

Keep the PIN limited to trusted race staff and change it before the event if it has been broadly shared.

## Local testing

Serve this directory from a local web server. Firebase's reserved `/__/firebase/init.json` endpoint is supplied automatically on Firebase Hosting; for local development, use the Firebase Hosting emulator so the same configuration endpoint is available.

## Deployment

The project uses Firebase Hosting, Cloud Functions, Secret Manager, and Cloud Firestore. Its deployment configuration is in `firebase.json`, and the database access policy is in `firestore.rules`. Browser writes are denied; validated changes are made only by the server-side function after PIN verification.

Do not add Firebase service-account credentials, access tokens, or private keys to this repository.
