# Premium Remodel Field

The native field companion for Premium Remodel. It uses the same Supabase account, leads, visits, and quote calendar as the Vercel dashboard.

## Local setup

Copy `.env.example` to `.env.local` and fill in the existing dashboard's public Supabase URL and anonymous key. Then run:

```bash
npm install
npm run typecheck
npx expo run:ios
```

Background location requires a native development or release build. It does not run in Expo Go.

## Location behavior

- A teammate must tap **Start shift** and approve the operating system prompts.
- The app sends a fresh fix after meaningful movement while the shift is active.
- The server stores only the latest position, not a route history.
- **End shift** clears the position from the company map.
- Signing out also ends an active shift.

## TestFlight release

1. Sign in with the Premium Remodel Expo account: `npx eas-cli login`.
2. Link the project: `npx eas-cli init`.
3. Add the three public environment values to the EAS project.
4. Run `npm run build:ios` and then `npm run submit:ios`.
5. In App Store Connect, add the build to a TestFlight group and enable a public link.
6. Set `NEXT_PUBLIC_IOS_APP_URL` on the Vercel dashboard project to that TestFlight link and redeploy.

The permanent installation page is `https://servicebuddy-ui.vercel.app/mobile`.
