import express from "express";
import {
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  loginUser,
  logoutUser,
  refreshUserAccessToken,
} from "../controllers/userController.js";
import { verifyToken } from "../middlewares/auth.js";
import { validateRequest } from "../middlewares/validations.js";
import {
  createUserSchema,
  updateUserSchema,
} from "../utils/validationSchemas/userSchema.js";
import { requireRole } from "../middlewares/RoleValidator.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// TEACHING EXERCISE — authorization is intentionally left incomplete below.
// These routes only check AUTHENTICATION (verifyToken), not AUTHORIZATION.
// As written: POST "/" is fully public, and any logged-in user can list, read,
// update, or delete ANY user by id (classic IDOR + missing role checks).
// Juniors harden this in the Auth/Security module by adding a `role` field,
// a requireRole("admin") middleware, and an ownership check
// (validateUserIdWithAccessToken). Do NOT ship this baseline as-is.
// ---------------------------------------------------------------------------

router.route("/login").post(loginUser);

router
  .route("/update-refresh-access")
  .put(verifyToken("refresh"), refreshUserAccessToken);

router.route("/logout").delete(verifyToken("access"), logoutUser);

router
  .route("/")
  .get(verifyToken("access"), requireRole("Admin"), getAllUsers)
  .post(
    verifyToken("access"),
    requireRole("Admin"),
    validateRequest(createUserSchema),
    createUser,
  );

router
  .route("/:id")
  .get(verifyToken("access"), getUserById)
  .put(verifyToken("access"), validateRequest(updateUserSchema), updateUser)
  .delete(verifyToken("access"), deleteUser);

export default router;
