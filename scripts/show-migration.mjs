import pg from "pg";
const { Client } = pg;

const db = process.env.DATABASE_URL;
if (!db) throw new Error("DATABASE_URL missing");

const client = new Client({ connectionString: db });
await client.connect();

const res = await client.query(
  `SELECT migration_name, finished_at
   FROM "_prisma_migrations"
   ORDER BY finished_at;`
);

console.table(res.rows);
await client.end();
