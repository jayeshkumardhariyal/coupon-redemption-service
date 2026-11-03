import Joi from "joi";

export const createCouponSchema = Joi.object({
  code: Joi.string().trim().uppercase().min(3).max(30).required(),

  discountType: Joi.string().valid("PERCENTAGE", "FIXED").required(),

  discountValue: Joi.number()
    .positive()
    .when("discountType", {
      is: "PERCENTAGE",
      then: Joi.number().max(100),
    })
    .required(),

  expiresAt: Joi.date().greater("now").required(),
});

export const updateCouponSchema = Joi.object({
  code: Joi.string().trim().uppercase().min(3).max(30).optional(),

  discountType: Joi.string().valid("PERCENTAGE", "FIXED").optional(),

  discountValue: Joi.number().positive().optional(),

  expiresAt: Joi.date().greater("now").optional(),
})
  .min(1)
  .unknown(false);
