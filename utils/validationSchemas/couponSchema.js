import Joi from "joi";

export const createCouponSchema = Joi.object({
  code: Joi.string().trim().uppercase().min(3).max(30).required(),

  discountType: Joi.string().valid("PERCENTAGE", "FIXED").required(),

  discountValue: Joi.number()
    .positive()
    .when("discountType", {
      is: "PERCENTAGE",
      then: Joi.number().max(99),
    })
    .required(),

  status: Joi.string().valid("DRAFT", "ACTIVE", "INACTIVE").optional(),

  expiresAt: Joi.date().greater("now").required(),
  maxRedemptions: Joi.number().integer().min(1).required(),

  maxRedemptionsPerUser: Joi.number().integer().min(1).required(),
  minOrderValue: Joi.number().min(0).required(),
});

export const updateCouponSchema = Joi.object({
  code: Joi.string().trim().uppercase().min(3).max(30).optional(),

  discountType: Joi.string().valid("PERCENTAGE", "FIXED").optional(),

  discountValue: Joi.number()
    .positive()
    .when("discountType", {
      is: "PERCENTAGE",
      then: Joi.number().max(99),
    })
    .optional(),

  status: Joi.string().valid("DRAFT", "ACTIVE", "INACTIVE").optional(),

  expiresAt: Joi.date().greater("now").optional(),
  maxRedemptions: Joi.number().integer().min(1).optional(),

  maxRedemptionsPerUser: Joi.number().integer().min(1).optional(),
  minOrderValue: Joi.number().min(0).optional(),
})
  .min(1)
  .unknown(false);

export const redeemCouponSchema = Joi.object({
  orderId: Joi.string().trim().required(),
  orderValue: Joi.number().positive().required(),
  couponCode: Joi.string().trim().uppercase().required(),
});
