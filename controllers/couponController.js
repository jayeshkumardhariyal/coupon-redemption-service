import { catchAsync } from "../utils/helpers.js";
import AppSuccess from "../middlewares/appSuccess.js";
import { createCouponService } from "../services/couponService.js";
import { updateCouponService } from "../services/couponService.js";
import {
  getAllCouponsService,
  getCouponByIdService,
  deleteCouponService,
} from "../services/couponService.js";

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

export const updateCoupon = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const coupon = await updateCouponService(id, updateData);

  return new AppSuccess(res, {
    message: "Coupon updated successfully",
    data: coupon,
  });
});

export const getAllCoupons = catchAsync(async (req, res) => {
  const coupons = await getAllCouponsService();

  return new AppSuccess(res, {
    message: "Coupons fetched successfully",
    data: coupons,
  });
});

export const getCouponById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const coupon = await getCouponByIdService(id);

  return new AppSuccess(res, {
    message: "Coupon fetched successfully",
    data: coupon,
  });
});

export const deleteCoupon = catchAsync(async (req, res) => {
  const { id } = req.params;

  const coupon = await deleteCouponService(id);

  return new AppSuccess(res, {
    message: "Coupon deleted successfully",
    data: coupon,
  });
});
