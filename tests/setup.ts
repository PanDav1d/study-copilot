import path from "node:path";

process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../data/test/test.db")}`;
process.env.UPLOAD_DIR = path.resolve(__dirname, "../data/test/uploads");
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123";
process.env.TZ = "Europe/Berlin";
