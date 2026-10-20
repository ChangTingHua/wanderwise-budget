# Where Does My Money Go?

A multi-currency budgeting app for working holiday travelers and people living abroad. Track income and expenses, check exchange rates, and keep your financial records organized by account.

## Live Demo

[Open the app](https://wanderwise-budget.vercel.app/)

## Features

- Add, edit, and delete income and expense records
- Track transactions in USD, TWD, EUR, JPY, and CAD
- View spending and income by month or a custom date range
- Check daily reference exchange rates and convert currencies
- Sign in with Supabase Auth; database policies keep each user's records private to their account

## Built With

HTML, CSS, JavaScript, Tailwind CSS, Supabase, and the Frankfurter API.

## Project Files

- `index.html` — Sign-in, registration, and budgeting interface
- `app.js` — Authentication, transactions, charts, and exchange rates
- `style.css` — UI styling and responsive layouts
- `tailwind.generated.css` — Compiled Tailwind CSS
- `config.js` — Supabase client configuration
- `supabase/schema.sql` — Database table and row-level security policies
