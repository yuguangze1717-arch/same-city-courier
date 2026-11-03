# Same-City Courier System

This is our group project for **HKMU COMP 3500SEF**. We built a small web app for sending parcels within Hong Kong. A sender creates and pays for an order, a dispatcher assigns a rider, and the rider takes the parcel to a storage point. The recipient can then check its status with the tracking number and the last four digits of their phone number.

The payment is simulated. In this project, `DELIVERED` means the parcel has reached a storage point, not that the recipient has collected it.

## Run the project

You need Node.js 22 or newer and npm.

```bash
git clone https://github.com/yuguangze1717-arch/hkmu-same-city-courier.git
cd hkmu-same-city-courier
npm ci
cp .env.example .env
npm run db:seed
npm start
```

Change `SESSION_SECRET` and `PAYMENT_SECRET` in `.env` to two different long random strings before starting the app. On Windows, you can copy `.env.example` to `.env` in File Explorer instead of using `cp`.

Open **http://localhost:3100** in your browser. The SQLite database is created at `data/courier.sqlite`. You do not need to install a separate database server. Run `npm test` to run the tests.

## Demo accounts

Run `npm run db:seed` first. All four accounts start with the password `Demo1234!`.

| Role | Email |
| --- | --- |
| Sender | `sender@example.com` |
| Dispatcher | `dispatcher@example.com` |
| Rider | `rider@example.com` |
| Administrator | `admin@example.com` |

These accounts are only for trying the app locally. Please do not use them for a public deployment.

## Try one delivery

1. Log in as **Sender** and create an order. Fill in the Hong Kong districts, addresses, parcel details, estimated weight, and recipient details. You can use `98765432` as the recipient phone number. Save the tracking number, then click **Simulate payment**.
2. Log in as **Dispatcher** and assign the paid order to a rider.
3. Log in as **Rider**. Start pickup, confirm pickup, and deliver the parcel to an active storage point. Enter a short delivery note as evidence.
4. Log out. On the home page, enter the tracking number and `5432` to check the parcel as a recipient.

The **Administrator** can add staff and storage points. They can also give an existing Sender account Rider or Dispatcher access without changing that account's email or password. The user can then open each role page from the top navigation.

In **My orders**, the sender can filter orders by payment, delivery, issue, delivered, and cancelled status. The sender can cancel an order until pickup is confirmed. If it was already paid, the app records a **mock refund** and removes any active Rider assignment. No real money moves.

## How we built it

We used Node.js, Express 5, EJS, Bootstrap 5, SQLite (`better-sqlite3`), and `express-session`. Pages are rendered on the server, with a little browser JavaScript for form checks and the price preview. The code is split into `routes`, `services`, `domain`, and `repositories`. Tests use Node's built-in test runner.

The main order path is `CREATED → PAID → ASSIGNED → PICKING_UP → PICKED_UP → DELIVERED`. A rider can report a failed delivery, which the dispatcher must resolve. Orders in `CREATED` have a 15-minute payment window. The Rider task page shows pickup and destination addresses plus sender and recipient contact details.

We chose a simple weight-based price for this version: HK$35 up to 1 kg, then HK$7 for each extra 0.5 kg up to 5 kg, and HK$12 for each extra 1 kg above 5 kg. Weight is rounded up to the next step. These are **our project prices**, not a courier company's official rates. The server calculates the price again when the order is created.

## What is not finished

There is no real payment, refund, map, notification, dispute process, or recipient pickup confirmation yet. We also have not added volumetric-weight pricing or a background job for expired orders. Sessions are stored in memory, and the current SQLite setup is intended for local use. Before putting the app online, we would need persistent storage, stronger protection for public tracking, and new passwords for the demo accounts.
