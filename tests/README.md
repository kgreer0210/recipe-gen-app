# Application tests, in plain language

The suite is intentionally layered so a failure answers a useful question:

- `npm run test:unit` — Did one of Mise AI's recipe or grocery rules change? These checks are fast and do not use the network.
- `npm run test:integration` — Can the app really save data, keep it private, and clean up related database rows? Temporary Supabase users and recipes are deleted after every run.
- `npm run test:e2e` — Can a person follow the three most important browser journeys? The AI response is fixed during this test so it is quick, repeatable, and does not spend model credits.
- `npm run test:all` — Run all three layers in order.

The database and browser layers use the same Supabase environment variables as the app. Never put their values in source control; local runs read `.env.local`, and GitHub Actions reads repository secrets.

## Reading a failure

Start with the first failed expectation. The test name says what the user expected, while the nearby error shows what happened instead. Fix the behavior, rerun that layer, and then run `npm run test:all` before publishing.
