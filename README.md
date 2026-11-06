# Hisaab – Personal & Multi-Business Finance Manager

A mobile-first, local-first finance tracker built with React, TypeScript, Vite, Dexie (IndexedDB), Recharts and Capacitor.

## What is included

- Dark navy and electric blue Hisaab interface
- Personal and business income/expense entry
- Multiple business names and accounts
- Dashboard income, expense and net cash-flow cards
- Month-by-month closing balance history chart
- Expense category pie chart
- Monthly income vs expense chart
- Transaction history and delete
- JSON backup and restore
- CSV transaction export
- Local IndexedDB storage
- PWA offline caching
- Capacitor Android project configuration

## Important limitations in this starter

This is a working starter project, not audited accounting software. It currently does not implement:
- Internal account transfers
- Editing transactions
- Credit card liability accounting
- Account-specific balance reconciliation
- Tax, GST or formal business bookkeeping
- Automated cloud backup

The displayed combined available balance is a simplified calculation: opening account balances plus recorded income minus recorded expenses. Use the app for testing and keep external backups. Do not rely on it as the sole record of important finances until the missing accounting features are implemented and tested.

All data is stored locally in the browser/app database. Clearing browser/app data or uninstalling can erase it. Export JSON backups regularly.

## Requirements

- Node.js LTS
- npm
- For Android APK: Android Studio with Android SDK

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build web app

```bash
npm run build
npm run preview
```

Build output is in `dist/`.

## Build Android APK with Capacitor

Run these commands from the project root:

```bash
npm install
npx cap add android
npm run build
npx cap sync android
npx cap open android
```

If `npx cap add android` reports that the Android platform already exists, do not run it again.

In Android Studio:
1. Wait for Gradle sync.
2. Select Build > Build Bundle(s) / APK(s) > Build APK(s).
3. For a test build, install the debug APK.
4. For long-term use, create a signed release APK and keep the signing key safe.

Typical debug APK path:
`android/app/build/outputs/apk/debug/app-debug.apk`

## Publish as a website

You can deploy the `dist/` folder to a static hosting provider. A website deployment is separate from APK generation. If you use the same data in a browser and in an installed APK, note that local databases are separate and do not automatically sync.

## Recommended next improvements

Before relying on the app for real bookkeeping, implement and test:
1. Internal transfers as paired account movements.
2. Edit transactions.
3. Account-specific balances.
4. Credit card purchases and repayments as liability movements.
5. Robust import validation and duplicate detection.
6. A proper historical balance calculation per selected scope/business.
7. Optional encrypted cloud backup if multi-device access is later required.
