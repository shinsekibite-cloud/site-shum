const Database = require('/app/node_modules/better-sqlite3');
const db = new Database(process.env.DB_PATH || '/app/data/dev.db');
db.exec(`
CREATE TABLE IF NOT EXISTS TicketCheckIn (
  id TEXT NOT NULL PRIMARY KEY,
  bookingId TEXT NOT NULL,
  userId TEXT NOT NULL,
  scannedById TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'QR',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bookingId) REFERENCES Booking(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
  FOREIGN KEY (scannedById) REFERENCES User(id) ON DELETE CASCADE
);
`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS TicketCheckIn_bookingId_userId_key ON TicketCheckIn(bookingId, userId)');
db.exec('CREATE INDEX IF NOT EXISTS TicketCheckIn_bookingId_idx ON TicketCheckIn(bookingId)');
db.exec('CREATE INDEX IF NOT EXISTS TicketCheckIn_createdAt_idx ON TicketCheckIn(createdAt)');
db.exec('CREATE INDEX IF NOT EXISTS TicketCheckIn_scannedById_idx ON TicketCheckIn(scannedById)');
console.log('ok', db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='TicketCheckIn'").all());
db.close();
