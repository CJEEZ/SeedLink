# Firebase setup

## Publish the web app with Netlify

The repository includes `netlify.toml` for the Vite production build, Node.js 22, and SPA route fallback. To connect it:

1. In Netlify, choose **Add new site → Import an existing project → GitHub** and select `CJEEZ/SeedLink`. Authorize Netlify to access the repository if prompted.
2. Set `VITE_FIREBASE_API_KEY` in the site's **Project configuration → Environment variables** to the Firebase Web API key from Firebase Console → Project settings → Your apps. This is public client configuration and will be included in the deployed JavaScript; never use a service-account key or other private credential.
3. Optionally set `VITE_FIREBASE_VAPID_KEY` to the Web Push certificate key from Firebase Console → Project settings → Cloud Messaging to enable browser push notifications.
4. Deploy the site. Netlify builds the `main` branch on each push and publishes `dist`. The `netlify.toml` configuration supplies the build command, output directory, root URL base path, and fallback for client-side routes.
5. In Firebase Console, add the Netlify site hostname (for example, `your-site-name.netlify.app`) under **Authentication → Settings → Authorized domains** so sign-in works on that domain.

The GitHub Pages deployment is configured separately. Netlify deployment does not require the Pages workflow.

## Publish the web app with GitHub Pages

The `Deploy GitHub Pages` workflow publishes the web app at `https://cjeez.github.io/SeedLink/` whenever a commit is pushed to `main`.

1. In GitHub, open **Settings → Secrets and variables → Actions** and add the `VITE_FIREBASE_API_KEY` repository secret from Firebase Console → Project settings → Your apps. This Firebase web key is public client configuration and will be visible in the deployed JavaScript; storing it as an Actions secret keeps it out of the source tree. Never use a service-account key or other private credential here.
2. To enable browser push notifications, also add the `VITE_FIREBASE_VAPID_KEY` repository secret from Firebase Console → Project settings → Cloud Messaging. Push notifications remain unavailable until this is configured.
3. Open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
4. In Firebase Console, add `cjeez.github.io` under **Authentication → Settings → Authorized domains** so sign-in works on the deployed site.
5. Push a commit to `main`, or manually run **Deploy GitHub Pages** from the repository's **Actions** tab. Open `https://cjeez.github.io/SeedLink/` after the workflow completes.

The deployment uses GitHub Pages' repository subpath and includes an SPA fallback for routes such as `/login` and `/home`. The existing GitHub Actions CI workflow only validates builds; Pages deployment is handled by the separate workflow above.

## Run the SQL Connect emulator with Docker

The Firebase emulators require Java. The Docker emulator service includes Java 21, so they can run without changing the Java installation on Windows.

Start Docker Desktop, then run from the project directory:

```powershell
docker compose --profile emulators up -d --build firebase-emulators
```

The SQL Connect emulator listens on `http://localhost:9399`. It uses the demo project ID `demo-seedlink` so local emulator work does not target the production Firebase project. Emulator data is stored in `dataconnect/.dataconnect/pgliteData`. Stop the container with `docker compose --profile emulators stop firebase-emulators`.

## Farmer request push notifications

Farmers can enable notifications for this browser or Android device from **Farmer profile → Delivery notifications**. When an administrator changes a request to approved, in transit, or delivered, a Firebase Cloud Function sends an FCM push notification to the farmer's registered devices. Rejected requests do not send a notification. Push notifications go to the app/browser, not a phone number; no Semaphore account or SMS charges are involved.

FCM message delivery has no per-message charge. Deploying the status-triggered Cloud Function requires Firebase Blaze with billing enabled. Cloud Functions has a monthly no-cost quota; usage beyond applicable quotas may be billed.

### Web setup

1. `VITE_FIREBASE_VAPID_KEY` is already configured in the local `.env.local` and documented in `.env.example`. The key is public; `.env.local` is ignored by Git.
2. If using a different Firebase project, generate a Web Push certificate key pair in Firebase Console → Project settings → Cloud Messaging, then set its public key as `VITE_FIREBASE_VAPID_KEY` in `.env.local`.
3. Ensure the site is served over HTTPS (localhost is allowed for development), rebuild, and redeploy the web app. Each farmer must allow browser notifications on each device.

### Android setup

1. Register an Android Firebase app with package name `com.seedlink.app`.
2. Download `google-services.json` into `android/app/google-services.json`. It is ignored by Git.
3. Run `npx cap sync android`, then build and install the Android app. Android 13 and later prompt the farmer to grant notification permission.

### Deploy and test

After enabling Blaze, install Functions dependencies and deploy the rules and sender:

```powershell
npm ci --prefix functions
firebase deploy --only database,functions --project seedlink-43161
```

The function uses Firebase Admin credentials; no FCM server key is stored in the app. Each farmer must enable notifications on the device they want to receive them on.

Run the backend unit tests locally with:

```powershell
npm ci
npm ci --prefix functions
npm test --prefix functions
```

Run the Realtime Database push-token access-rule tests in the emulator with:

```powershell
firebase emulators:exec --only database --project demo-seedlink --config firebase.rules-test.json "npm run test:rules --prefix functions"
```

## Farmer email notifications

Farmers can opt in from **Farmer profile → Email request updates**. Emails go to the email address on the farmer's Firebase Authentication account (including the Gmail address used to sign in). With email updates enabled, notifications are sent when a farmer submits a request, an administrator approves or rejects it, its status changes to in transit or delivered, and the farmer confirms receipt. Editing other request details does not send an email. Email is off by default and can be turned off in the profile.

Email delivery uses Resend. The notification function is not active until deployment. Before deploying, enable Firebase Blaze billing, create a Resend account, and verify a sender domain. Store the API key as a Firebase secret and set the sender address during deployment:

```powershell
firebase functions:secrets:set RESEND_API_KEY --project seedlink-43161
firebase deploy --only database,functions --project seedlink-43161
```

Firebase prompts for `RESEND_FROM_EMAIL` during deployment. Use a sender address on the verified Resend domain (for example, `SeedLink <updates@example.com>`). Do not put the Resend API key in the web app, `.env.local`, or source control. Function deployment requires Blaze; provider usage may have separate limits or charges.

Test email-content generation with:

```powershell
npm test --prefix functions
```

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