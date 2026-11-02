import { catchAsync } from "../utils/helpers.js";
import AppSuccess from "../middlewares/appSuccess.js";
import { createCouponService } from "../services/couponService.js";

export const createCoupon = catchAsync(async (req, res) => {
  const { code, discountType, discountValue, expiresAt } = req.body;

  const coupon = await createCouponService({
    code,
    discountType,
    discountValue,
    expiresAt,
  });

  return new AppSuccess(res, {
    statusCode: 201,
    message: "Coupon created successfully",
    data: coupon,
  });
});
