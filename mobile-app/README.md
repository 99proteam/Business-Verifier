# Business Verifier Mobile App

This Flutter app uses the same Firebase project and Firestore collections as the website, so both sides stay in sync in real time.

## What this app includes
- Google login and email/password login
- Role selection (`customer`, `employee`, `business_owner`) stored in `users/{uid}`
- Real-time business listing stream (`businessApplications`)
- Real-time product/service stream (`digitalProducts`, `businessServices`)
- Ticket create + ticket status stream (`supportTickets`)
- Order stream for customer and business owner (`orders`)
- In-app notification stream (`users/{uid}/notifications`)
- FCM token registration against Next.js API (`/api/mobile/push/register`)
- Truecaller verification flow via backend API (`/api/auth/truecaller/verify`)

## Bootstrap
1. Open terminal in `mobile-app`.
2. Generate native Flutter scaffold files:
```bash
flutter create .
```
3. Get packages:
```bash
flutter pub get
```
4. Run with Firebase + API dart defines:
```bash
flutter run \
  --dart-define=API_BASE_URL=https://your-vercel-domain.vercel.app \
  --dart-define=FIREBASE_API_KEY=YOUR_KEY \
  --dart-define=FIREBASE_APP_ID=YOUR_APP_ID \
  --dart-define=FIREBASE_MESSAGING_SENDER_ID=YOUR_SENDER_ID \
  --dart-define=FIREBASE_PROJECT_ID=YOUR_PROJECT_ID \
  --dart-define=FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN \
  --dart-define=FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
```

## Notes
- For Android emulator local dev, set `API_BASE_URL` to `http://10.0.2.2:3000`.
- For iOS simulator local dev, set `API_BASE_URL` to `http://localhost:3000`.
- Push dispatch is handled by the website backend queue (`mobilePushQueue`) and `/api/mobile/push/dispatch`.
