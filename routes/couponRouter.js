import express from "express";
import { createCoupon } from "../controllers/couponController.js";

const couponRouter = express.Router();

couponRouter.post("/", createCoupon);

export default couponRouter;
