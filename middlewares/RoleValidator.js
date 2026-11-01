import AppError from "./appError.js";

export const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      console.log(req.user.role);
      return next(
        new AppError("Forbidden", 403, {
          errors: [
            {
              field: "role",
              message: "Insufficient permissions",
            },
          ],
        }),
      );
    }

    next();
  };
};
