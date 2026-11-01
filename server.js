import dotenv from "dotenv";
dotenv.config();
import app from "./app.js";
import { connectDB } from "./config/config.js";
import { initializeCrons } from "./services/cronService.js";

const PORT = process.env.PORT || 1234;

// server.js owns the runtime side effects: DB connection, cron jobs, listening.
connectDB();
initializeCrons();

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
