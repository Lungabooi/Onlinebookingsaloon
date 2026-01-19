# Hair Salon Booking (Fullstack JS)

Simple fullstack booking app for a hair salon.

Run locally:

```bash
npm install
npm start
```

Open http://localhost:4000 in your browser.

Project layout:

- [server.js](server.js) — Express server + SQLite DB
- [public/index.html](public/index.html) — frontend UI

Authentication:

- Register via POST /api/register with JSON `{ name, email, password }`.
- Login via POST /api/login with JSON `{ email, password }` — returns a JWT token.
- Client stores token and sends `Authorization: Bearer <token>` for protected endpoints (create/delete bookings).

Email verification:

- After registering, a verification email is sent with a link to `/api/verify?token=...`.
- Bookings (create/delete) are allowed only for verified users.
- Configure SMTP via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and set `APP_URL` for correct links. If SMTP is not configured, the server will use an Ethereal test account and print a preview URL to the console.
 - Password reset: endpoints `POST /api/password-reset-request` (body `{ email }`) and `POST /api/password-reset` (body `{ token, password }`). Reset links expire after 1 hour.
 - Roles: users have a `role` field (`customer` by default). Admin/staff can manage bookings; deletion is allowed to booking owner or users with role `admin`/`staff`.

Install new dependency for email sending:

```bash
npm install nodemailer
```

