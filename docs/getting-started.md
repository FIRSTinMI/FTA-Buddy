[Home](./)

# Getting Started

FTA Buddy is a web app (and installable mobile app) for FRC event volunteers. It gives FTAs, FTAAs, CSAs, and RIs real-time field data, team support notes, and match logs on their phones or tablets - without needing to be on the FMS network.

## Creating an Account

Go to **ftabuddy.com** and tap **Login / Sign Up**.

You can sign up with:

- **Email and password** - enter an email, choose a password, and pick a username.
- **Google** - tap "Sign in with Google" and complete the OAuth flow.

After signing in you'll be asked to select your **role**. You can change this later in Settings.

## Roles

Your role determines which features you see and how the app behaves by default.

| Role     | Who it's for            | Default notepad view | Key access                                             |
| -------- | ----------------------- | -------------------- | ------------------------------------------------------ |
| **FTA**  | Field Technical Advisor | Field view           | Monitor, Flashcards, Notepad, Logs, Checklist, Reports |
| **FTAA** | Assistant FTA           | Field view           | Same as FTA                                            |
| **CSA**  | Control System Advisor  | Feed view            | Notepad, References, Notifications                     |
| **RI**   | Robot Inspector         | Feed view            | Checklist, References, Notifications                   |

You can change your role at any time in [Settings](./settings).

## Joining an Event

To access live event data you need an **event password** from whoever is hosting the event for your region.

1. Tap **Login / Join Event** on the login screen (or open Settings if already logged in).
2. Enter the event password (e.g. `robot-field-42`).
3. You'll now see the event's live data in Monitor, Notepad, and Checklist.

If you don't have the password, ask your FTA or head of field operations.

## Notepad-Only Mode

If the event was created in **Notepad Only** mode (no FMS extension connection), the Field Monitor and Match Logs features won't be available. Notepad, Checklist, and References still work normally.

## Installing as an App (PWA)

FTA Buddy can be installed to your phone's home screen so it works like a native app:

- **Android (Chrome):** Tap the three-dot menu → "Add to Home Screen" or "Install App".
- **iOS (Safari):** Tap the Share button → "Add to Home Screen".
- **Desktop (Chrome):** Look for the install icon in the address bar, or open Settings → "Install FTA Buddy".

Once installed, the app opens full-screen without a browser bar and is available from your home screen.

## Navigation

The bottom navigation bar changes based on your role:

- **FTA / FTAA:** Monitor · Flashcards · References · Notepad
- **CSA / RI:** Notepad · Status Lights · Software Docs · Notifications

The gear icon (top right on most pages) opens [Settings](./settings).
