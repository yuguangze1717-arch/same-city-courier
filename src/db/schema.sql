PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('Sender','Dispatcher','Rider','Administrator')),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_roles (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('Sender','Dispatcher','Rider','Administrator')),
 PRIMARY KEY(user_id,role)
);
CREATE TRIGGER IF NOT EXISTS users_initial_role AFTER INSERT ON users
BEGIN
 INSERT OR IGNORE INTO user_roles(user_id,role) VALUES (NEW.id,NEW.role);
END;
CREATE TABLE IF NOT EXISTS storage_points (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY, tracking_no TEXT NOT NULL UNIQUE, sender_id INTEGER NOT NULL REFERENCES users(id),
 recipient_name TEXT NOT NULL, recipient_phone TEXT NOT NULL, pickup_address TEXT NOT NULL,
 pickup_district TEXT NOT NULL DEFAULT '', dropoff_district TEXT NOT NULL, dropoff_address TEXT NOT NULL DEFAULT '',
 item_category TEXT NOT NULL DEFAULT '', item_description TEXT NOT NULL DEFAULT '',
 weight_grams INTEGER NOT NULL DEFAULT 0, chargeable_grams INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('CREATED','PAID','ASSIGNED','PICKING_UP','PICKED_UP','DELIVERED','FAILED','CANCELLED')),
 amount_cents INTEGER NOT NULL, expires_at TEXT NOT NULL, storage_point_id INTEGER REFERENCES storage_points(id),
 current_rider_id INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payments (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
 status TEXT NOT NULL CHECK(status IN ('pending','succeeded','refund_pending','refunded')),
 amount_cents INTEGER NOT NULL, provider_ref TEXT UNIQUE, paid_at TEXT
);
CREATE TABLE IF NOT EXISTS assignments (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), rider_id INTEGER NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL, assigned_by INTEGER NOT NULL REFERENCES users(id), assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ended_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_assignment ON assignments(order_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS status_events (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), status TEXT NOT NULL,
 event_type TEXT NOT NULL, actor_id INTEGER REFERENCES users(id), note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
