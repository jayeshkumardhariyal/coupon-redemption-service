import express from "express";
import userRouter from "./userRouter.js";
import adminRouter from "./adminRouter.js";
import publicRouter from "./publicRouter.js";
import { verifyToken } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/RoleValidator.js";

const router = express.Router();

// Authenticated user resource (self-contained login/logout/refresh + CRUD).
router.use("/users", userRouter);

// Admin-gated resources. NOTE: verifyToken("access") only proves the caller is
// authenticated — there is no `role` check yet, so any logged-in user reaches
router.use("/admin", verifyToken("access"), requireRole("Admin"), adminRouter);

// Public, unauthenticated resources (storefront-style reads + purchase).
router.use("/public", publicRouter);

export default router;
