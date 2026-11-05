import { catchAsync } from "../utils/helpers.js";
import AppSuccess from "../middlewares/appSuccess.js";
import {
  redeemCouponService,
  revertRedemptionService,
  getCustomerRedemptionHistoryService,
  getRevertedRedemptionHistoryService,
} from "../services/redemptionService.js";

export const redeemCoupon = catchAsync(async (req, res) => {
  const { orderId, orderValue, couponCode } = req.body;

  const redemption = await redeemCouponService({
    customerId: req.user.id,
    orderId,
    orderValue,
    couponCode,
  });

  return new AppSuccess(res, {
    statusCode: 201,
    message: "Coupon redeemed successfully",
    data: redemption,
  });
});

export const revertRedemption = catchAsync(async (req, res) => {
  const { redemptionId } = req.params;

  const redemption = await revertRedemptionService({
    redemptionId,
  });

  return new AppSuccess(res, {
    message: "Redemption reverted successfully",
    data: redemption,
  });
});

export const getCustomerRedemptionHistory = catchAsync(async (req, res) => {
  const history = await getCustomerRedemptionHistoryService({
    customerId: req.user.id,
    queryString: req.query,
  });

  return new AppSuccess(res, {
    message: "Redemption history fetched successfully",
    data: history,
  });
});

export const getRevertedRedemptionHistory = catchAsync(async (req, res) => {
  const history = await getRevertedRedemptionHistoryService({
    queryString: req.query,
  });

  return new AppSuccess(res, {
    message: "Reverted redemption history fetched successfully",
    data: history,
  });
});
