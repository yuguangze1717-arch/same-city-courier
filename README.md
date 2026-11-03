# HKMU Same-City Courier System

A browser-based coursework prototype for HKMU COMP 3500SEF / 8500SEF. It models a Hong Kong same-city parcel journey from order creation and simulated payment to dispatch, pickup, delivery to a storage point, and limited recipient tracking.

This is a **local demonstration application**, not a live courier or payment service. `DELIVERED` means the Rider handed the parcel to an active storage point; it does not mean the Recipient collected it.

## What you can demonstrate

| Role | Available actions |
| --- | --- |
| Sender | Register, create an order, view orders, simulate payment, and track a parcel. |
| Dispatcher | Assign paid orders to Riders, reassign before pickup, and resolve delivery failures. |
| Rider | Start pickup, confirm pickup, deliver to an active storage point with evidence, or report failure. |
| Recipient | Track limited status information from the home page using a tracking number and the last four digits of the recipient phone number. No account is required. |
| Administrator | Create staff accounts, grant Rider or Dispatcher access to an existing account, activate/deactivate staff accounts, and manage storage points. |

One registered account can hold Sender, Rider, and Dispatcher roles together. Only an Administrator can grant staff roles. The interface is in English and works on desktop and mobile screens.

## Run locally

Requirements: **Node.js 22 or newer** and npm. The application uses SQLite, so no separate database server is needed.

```bash
git clone https://github.com/yuguangze1717-arch/hkmu-same-city-courier.git
cd hkmu-same-city-courier
npm ci
cp .env.example .env
npm run db:seed
npm test
npm start
```

On Windows, copy `.env.example` to `.env` using File Explorer or `copy .env.example .env` in Command Prompt. Before starting, replace `SESSION_SECRET` and `PAYMENT_SECRET` in `.env` with different long random values. Open **http://localhost:3100**. Stop the server with `Ctrl+C`.

The database is created automatically at `data/courier.sqlite` unless `DB_PATH` is changed. `npm run db:seed` can be run more than once without duplicating the sample accounts or storage points. Local `.env`, database files, and installed dependencies are excluded from Git.

## Sample accounts

These accounts are for **local demonstration only**. Each initially uses `Demo1234!` as its password.

| Role | Email |
| --- | --- |
| Sender | `sender@example.com` |
| Dispatcher | `dispatcher@example.com` |
| Rider | `rider@example.com` |
| Administrator | `admin@example.com` |

To demonstrate the full journey:

1. Sign in as **Sender**. Create an order with pickup and destination districts, address details, parcel category, short description, estimated weight, and recipient details. For example, use `98765432` as the recipient phone number. Record the tracking number and select **Simulate payment**.
2. Sign out and sign in as **Dispatcher**. Assign the now `PAID` order to an active Rider.
3. Sign out and sign in as **Rider**. Start pickup, confirm pickup, then choose an active storage point and enter delivery evidence.
4. Sign out. On the home page, enter the tracking number and phone suffix `5432` to view the limited tracking timeline.
5. Sign in as **Administrator** to manage storage points or choose **Grant role to an existing account**. Enter a registered Sender email and select Rider or Dispatcher; the existing email, password, and Sender access stay in place.

## Technology and project structure

- Node.js, Express 5, EJS templates, Bootstrap 5, custom CSS, and browser JavaScript
- SQLite through `better-sqlite3`; `express-session` for local sessions; `dotenv` for configuration
- Node's built-in `node:test` runner (`npm test`)
- Server-side layers: `src/routes` → `src/services` → `src/domain` → `src/repositories`; schema and sample data are in `src/db`
- A mock `PaymentGateway`; **no real payment is made**

## Business rules and assumptions

- Normal order flow: `CREATED → PAID → ASSIGNED → PICKING_UP → PICKED_UP → DELIVERED`. `PICKED_UP → FAILED → DELIVERED/CANCELLED` is a simplified failure-resolution path awaiting group confirmation. `DELIVERED` is delivery to a storage point.
- A `CREATED` quote lasts 15 minutes. Expiry is checked when the order is accessed or payment is attempted; there is no background expiry job.
- Sender enters an estimated actual weight from 0.01 to 20 kg. This **project tariff** is HK$35 up to 1 kg, plus HK$7 for each additional 0.5 kg through 5 kg, then HK$12 for each additional 1 kg. Weight rounds up to the next billing step. The rounding approach is informed by [SF Express Hong Kong's domestic rate sheet](https://htm.sf-express.com/hk/tc/download/HK-Express-Service-Rate-sender-paid_20260130.pdf); **the amounts are our own coursework assumptions, not SF Express prices**. The server recalculates the amount when an order is created.
- A paid order can have one current Rider. Reassignment is allowed before pickup and requires a reason. Rider delivery requires an active storage point and text evidence.
- Recipient tracking returns status, timestamps, and the storage point only. It does not reveal names, phone numbers, addresses, or internal notes.
- Deactivating a staff account currently disables all its roles, including Sender. This is a simplified account-management rule.

## Current limits

There is no real payment or refund, notification service, map routing, recipient collection confirmation, automated expiry worker, or dispute workflow. The app does not yet calculate volumetric weight, regional surcharges, or price adjustments after weighing the parcel. Staff and storage-point workflows are intentionally compact for demonstration.

**Do not deploy this version to the public internet as-is.** The seeded accounts have known passwords, `express-session` uses its in-memory store, and public tracking needs rate limiting and stronger verification. A hosted copy would also need persistent database storage and production secrets; a plain `localhost` link is only reachable from the computer running the app.
