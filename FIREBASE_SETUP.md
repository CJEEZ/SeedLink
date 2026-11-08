# Firebase setup

## Run the SQL Connect emulator with Docker

The Firebase emulators require Java. The Docker emulator service includes Java 21, so they can run without changing the Java installation on Windows.

Start Docker Desktop, then run from the project directory:

```powershell
docker compose --profile emulators up -d --build firebase-emulators
```

The SQL Connect emulator listens on `http://localhost:9399`. It uses the demo project ID `demo-seedlink` so local emulator work does not target the production Firebase project. Emulator data is stored in `dataconnect/.dataconnect/pgliteData`. Stop the container with `docker compose --profile emulators stop firebase-emulators`.

## Customer service inbox

Farmers can open a private conversation from **Customer service** in their dashboard. They choose a topic, add a subject, and send messages to the SeedLink administration team. Administrators can view all conversations, reply, close or reopen, and delete them. Farmers can view and reply only to their own open conversations and can delete their own conversations. Deletion permanently removes the conversation and its messages. The local demo mode stores conversations in the browser's local storage; production conversations use the Realtime Database.

The support inbox requires the `supportTickets` rules in `database.rules.json`. Review the rules and deploy them to the intended Firebase project before enabling the live inbox:

```powershell
firebase deploy --only database --project seedlink-43161
```

The rules scope farmer list queries to the signed-in farmer, permit administrators to manage conversations, allow farmers to delete only their own conversations, and allow only append-only messages from the authenticated conversation participants. No external messaging provider, Cloud Function, or billing-plan change is required.

## OpenStreetMap delivery tracking

Delivery tracking uses OpenStreetMap raster tiles and municipality-center coordinates from OpenStreetMap for all supported Oriental Mindoro municipalities. Destination lookup requires an exact municipality match, preventing unknown names from silently placing the destination at a generic map center. The public OSRM routing demo service draws a road route and estimates distance and travel time; no map API key is required. The route service is a community demo endpoint and is not intended for high-volume or production-critical routing; use a hosted OSRM instance or another contracted routing provider if usage grows. When live truck coordinates are present, those coordinates are sent to the routing service to request a route. Live GPS still requires a trusted driver device or integration to write `latitude`, `longitude`, and `lastLocationAt` to the allocation request.

## Configure the web app

1. Copy `.env.example` to `.env.local` and replace `VITE_FIREBASE_API_KEY` with the actual Firebase Web API key from **Project settings → Your apps**. Do not leave the placeholder or any hardcoded alternative in the source code.
2. In Firebase Console, enable **Authentication > Sign-in method > Email/Password** and **Google**. Add the app's hostnames, including `localhost` for local development, under **Authentication > Settings > Authorized domains**.
3. Create a **Realtime Database** in Firebase Console and make sure its URL matches `VITE_FIREBASE_DATABASE_URL` in `.env.local`.
4. Create administrator, depot-manager, and executive accounts in **Authentication > Users**. Farmers and cooperative leaders can register themselves through `/signup`.
5. In Realtime Database, create `users/{uid}` profiles for staff Authentication UIDs. Set `displayName`, `email`, and `role`; add `municipality` where applicable and `depot` for depot managers. Farmer profiles are created by signup with the fixed `farmer` role. Supported roles are `admin`, `depot_manager`, `farmer`, and `executive`.

## Publish access rules

Deploy the Realtime Database rules before allowing sign-up or data access. Install and authenticate with the Firebase CLI, then run:

```powershell
firebase deploy --only database --project seedlink-43161
```

Rules are in `database.rules.json`. They permit profile reads only by the profile owner, allow farmers to create only farmer-role profiles, permit a Google-authenticated farmer profile to omit email if Google provides none, allow an incomplete farmer profile to add only its missing municipality, make the seed catalog publicly readable, scope depot managers to their assigned depot, restrict farmers to their own requests and support conversations, and keep executives read-only. Request lists use indexed queries by requester UID or depot. Approval reserves stock with Realtime Database transactions.

## Profile photo uploads

Enable Firebase Storage and create the project's Storage bucket in Firebase Console. Profile photos are uploaded to `users/{uid}/profile/avatar`; Storage rules restrict access to that account and accept only JPG, PNG, or WebP images up to 5 MB. Deploy the rules before using uploads:

```powershell
firebase deploy --only storage --project seedlink-43161
```

The uploaded download URL is saved to the signed-in Firebase Authentication profile, so it remains the account's photo after signing out and back in.

## Role provisioning

Staff profile records must be created by a trusted administrator in Realtime Database or by a trusted Admin SDK process. Do not allow clients to assign privileged roles. Without a valid `users/{uid}` profile, the app will deny workspace access.

Google sign-in uses Firebase Authentication, but access to SeedLink still requires a valid `users/{uid}` profile. A first-time Google account can select a municipality to create its own farmer profile; an email is saved when Google supplies one, but is not required for this Google-only profile creation. Google sign-in never grants staff or admin roles. If an email already has an Email/Password Firebase account, have a trusted administrator link Google to that existing account; do not create a second UID or assign admin access through public sign-up.

## Data paths

Realtime Database stores records at the root, keyed by record ID:

- `users/{uid}`
- `seedInventory/{batchId}`
- `allocationRequests/{requestId}`
- `supportTickets/{ticketId}/messages/{messageId}`

Existing Firestore data is not copied automatically. Export it and import JSON into these Realtime Database paths before switching users to the live database. Inventory and request records must be objects keyed by their IDs; do not import Firestore's nested `artifacts/{appId}/public/data` path structure.