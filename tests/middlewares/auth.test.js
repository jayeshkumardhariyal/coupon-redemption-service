import { jest } from "@jest/globals";

jest.unstable_mockModule("jsonwebtoken", () => ({
  default: { verify: jest.fn() },
}));

const jwt = (await import("jsonwebtoken")).default;
const { verifyToken } = await import("../../middlewares/auth.js");

describe("verifyToken middleware", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: {}, cookies: {} };
    res = {};
    next = jest.fn();
    process.env.JWT_ACCESS_SECRET = "access-secret";
    process.env.JWT_REFRESH_SECRET = "refresh-secret";
  });

  it("should call next() with a 401 error when the token is missing", async () => {
    await verifyToken("access")(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it("should verify an access token from the Authorization header", async () => {
    const decoded = { id: "user123" };
    req.headers.authorization = "Bearer header-token";
    jwt.verify.mockReturnValue(decoded);

    await verifyToken("access")(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith("header-token", "access-secret");
    expect(req.user).toBe(decoded);
    expect(req.refreshToken).toBeNull();
    expect(next).toHaveBeenCalledWith();
  });

  it("should verify a refresh token from cookies and set req.refreshToken", async () => {
    const decoded = { id: "user123" };
    req.cookies.refreshToken = "cookie-refresh";
    jwt.verify.mockReturnValue(decoded);

    await verifyToken("refresh")(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith("cookie-refresh", "refresh-secret");
    expect(req.user).toBe(decoded);
    expect(req.refreshToken).toBe("cookie-refresh");
    expect(next).toHaveBeenCalledWith();
  });

  it("should forward the error to next() when verification throws", async () => {
    req.cookies.accessToken = "bad-token";
    jwt.verify.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    await verifyToken("access")(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(req.user).toBeUndefined();
  });
});
